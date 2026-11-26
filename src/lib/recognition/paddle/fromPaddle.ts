import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { matchChart } from "@/lib/songs/matcher";
import { rawFromRegions } from "../fromRegions";
import { parseChartHints, type OcrToken } from "../tokens";
import type { OcrLine } from "./engine";
import type { Observations } from "../consensus/engine";
import { isReliableGr, type JudgeRead } from "../judgeRead";
import { digitRuns, parseJudgeReads, parseJudgeRows, scoreCandidates } from "./parse";

export interface PaddleReadings {
  /** 曲名・譜面の枠の行 */
  title: readonly OcrLine[];
  /** スコア欄の読み。前処理ごとに 1 件 */
  score: readonly (readonly OcrLine[])[];
  /** score の各読みの前処理の種類。色で抜き出した読み（color）と元の画像の読み（raw）は、別の読みとして数える */
  scoreGroups?: readonly ("color" | "raw")[];
  /** 判定表の読み。拡大率を変えた読みが複数あってよい */
  judge?: readonly (readonly OcrLine[])[];
}

const META = /NOTES?|ANOTHER|HYPER|NORMAL|LEGGENDARIA|BEGINNER|^\s*(SP|DP)\b/i;

/** 曲名の行を選ぶ。難易度やノーツ数の行を除き、確度×文字数が最も大きい行 */
export function pickTitleLine(lines: readonly OcrLine[]): string | null {
  const cands = lines.filter((l) => !META.test(l.text) && /[A-Za-z぀-ヿ一-鿿]{2}/.test(l.text));
  const best = cands.sort((a, b) => b.confidence * b.text.length - a.confidence * a.text.length)[0];
  return best ? best.text.trim() : null;
}

/**
 * 曲名の行を、曲データとの照合で選ぶ。曲名の下にはアーティスト名などもあり、見た目だけでは選べない。
 * 難易度・レベルで絞った譜面のうち、どの行が最も曲名に似ているかで決める。照合できなければ見た目で選ぶ。
 */
export function bestTitleLine(lines: readonly OcrLine[], master: readonly SongMasterEntry[]): string | null {
  const tokens = lines.flatMap((l) => l.text.split(/\s+/).filter(Boolean).map((text) => ({ text, confidence: l.confidence })));
  const hints = parseChartHints(tokens);
  let best: { text: string; score: number } | null = null;
  for (const l of lines) {
    if (META.test(l.text) || !/[A-Za-z぀-ヿ一-鿿]{2}/.test(l.text)) continue;
    const m = matchChart(master, { ...hints, titleText: l.text.trim() });
    const score = m.candidates[0]?.score ?? 0;
    if (!best || score > best.score) best = { text: l.text.trim(), score };
  }
  return best && best.score >= 0.6 ? best.text : pickTitleLine(lines);
}

type Judge = NonNullable<Observations["judge"]>;

/** 同じ数字の読みをまとめる（確度は最大） */
export function mergeReads(reads: readonly JudgeRead[]): JudgeRead[] {
  const m = new Map<number, number>();
  for (const r of reads) m.set(r.n, Math.max(m.get(r.n) ?? 0, r.conf));
  return [...m].map(([n, conf]) => ({ n, conf }));
}

/**
 * 判定表の読みから、PG・GR を決める。ラベル（PGREAT・GREAT）が読めていればそれに従う。
 * 数字だけの枠のときは、読めた数字をすべて集め、「PG × 2 ＋ GR ＝ スコア欄の読み」になる組み合わせ（PG > GR）が
 * ちょうど 1 つあればそれを採る。スコア欄と独立した読みの一致なので、裏付けになる。
 */
export function judgeFromReads(reads: readonly (readonly OcrLine[])[], scores: ReadonlySet<number>): Judge | undefined {
  for (const lines of reads) {
    const labeled = parseJudgeRows(lines);
    if (labeled.pg !== undefined && labeled.gr !== undefined) return labeled;
  }
  const pool = mergeReads(reads.flatMap((lines) => parseJudgeReads(lines)));
  const pairs: { pg: number; gr: number }[] = [];
  for (const pg of pool) for (const gr of pool) if (pg.n >= 10 && pg.n > gr.n && isReliableGr(gr) && scores.has(pg.n * 2 + gr.n)) pairs.push({ pg: pg.n, gr: gr.n });
  if (pairs.length === 1) return pairs[0];
  // 裏付けのない読み。EX は作らない
  return undefined;
}

/**
 * 前処理の種類が 2 つ以上にまたがって一致した値にする。確度は、どの読みも 80 以上、
 * または片方が 95 以上でもう片方が 50 以上（元の画像は背景に負けて確度が下がりやすい）。
 */
export function crossGroupValues(score: readonly (readonly OcrLine[])[], groups: readonly string[] | undefined): number[] {
  if (!groups) return [];
  // 前処理の種類ごとに、値 → 最も高い確度
  const byGroup = new Map<string, Map<number, number>>();
  score.forEach((lines, i) => {
    const m = byGroup.get(groups[i]) ?? new Map<number, number>();
    for (const l of lines) for (const run of digitRuns([l.text])) for (const c of scoreCandidates(run)) m.set(Number(c), Math.max(m.get(Number(c)) ?? 0, l.confidence));
    byGroup.set(groups[i], m);
  });
  const maps = [...byGroup.values()];
  if (maps.length < 2) return [];
  return [...maps[0].keys()].filter((v) => {
    const confs = maps.map((m) => m.get(v));
    if (confs.some((c) => c === undefined)) return false;
    const cs = confs as number[];
    return cs.every((c) => c >= 80) || (Math.max(...cs) >= 95 && cs.every((c) => c >= 50));
  });
}

/**
 * 確度 90 以上の読みが 2 回以上そろった値。他に確度 80 以上の別の値があれば、決められないので空にする。
 */
export function strongScoreValues(score: readonly (readonly OcrLine[])[]): number[] {
  const high = new Map<number, number>(); // 値 → 確度 90 以上で読めた回数（1 回の読みで 1 と数える）
  const rival = new Set<number>(); // 確度 80 以上で読めた値
  for (const lines of score) {
    const seen = new Set<number>();
    for (const l of lines) {
      for (const run of digitRuns([l.text])) {
        for (const c of scoreCandidates(run)) {
          const v = Number(c);
          if (l.confidence >= 80) rival.add(v);
          if (l.confidence >= 90) seen.add(v);
        }
      }
    }
    for (const v of seen) high.set(v, (high.get(v) ?? 0) + 1);
  }
  const strong = [...high].filter(([, n]) => n >= 2).map(([v]) => v);
  return strong.length === 1 && [...rival].every((v) => v === strong[0] || isFarOrWeak(v)) ? strong : [];
}

/** 競合として数えない値。+0000 のような差分表示や、1〜2 桁の断片 */
const isFarOrWeak = (v: number): boolean => v < 100;

/** PaddleOCR の読みから結果を組み立てる。曲名で曲を特定し、ノーツ数が分かればスコア・判定・差分を合意で解く */
export function rawFromPaddle(r: PaddleReadings, master: readonly SongMasterEntry[]): RawResult | null {
  const titleTokens: OcrToken[] = r.title.flatMap((l) => l.text.split(/\s+/).filter(Boolean).map((text) => ({ text, confidence: l.confidence })));
  const scoreReadings = r.score.map((lines) => digitRuns(lines.map((l) => l.text)).flatMap(scoreCandidates));
  const scoreSet = new Set(scoreReadings.flat().map(Number).filter((n) => Number.isInteger(n)));
  const judge = r.judge ? judgeFromReads(r.judge, scoreSet) : undefined;
  const extras = judge && (judge.pg !== undefined || judge.gr !== undefined) ? { judge } : undefined;
  return rawFromRegions(titleTokens, scoreReadings, master, bestTitleLine(r.title, master) ?? undefined, extras, true, crossGroupValues(r.score, r.scoreGroups), mergeReads((r.judge ?? []).flatMap((lines) => parseJudgeReads(lines))), strongScoreValues(r.score));
}
