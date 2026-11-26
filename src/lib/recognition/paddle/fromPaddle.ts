import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { matchChart } from "@/lib/songs/matcher";
import { rawFromRegions } from "../fromRegions";
import { parseChartHints, type OcrToken } from "../tokens";
import type { OcrLine } from "./engine";
import type { Observations } from "../consensus/engine";
import { digitRuns, parseJudgeNumbers, parseJudgeRows, scoreCandidates } from "./parse";

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
  const tokens = lines.flatMap((l) => l.text.split(/s+/).filter(Boolean).map((text) => ({ text, confidence: l.confidence })));
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
  const pool = [...new Set(reads.flatMap((lines) => parseJudgeNumbers(lines)))];
  const pairs: { pg: number; gr: number }[] = [];
  for (const pg of pool) for (const gr of pool) if (pg >= 10 && pg > gr && scores.has(pg * 2 + gr)) pairs.push({ pg, gr });
  if (pairs.length === 1) return pairs[0];
  // 裏付けのない読み。EX は作らない
  return undefined;
}

/** 確度の高い読みを、前処理の種類が 2 つ以上にまたがって一致した値にする */
const CROSS_CONFIDENCE = 80;
export function crossGroupValues(score: readonly (readonly OcrLine[])[], groups: readonly string[] | undefined): number[] {
  if (!groups) return [];
  const byGroup = new Map<string, Set<number>>();
  score.forEach((lines, i) => {
    const set = byGroup.get(groups[i]) ?? new Set<number>();
    for (const l of lines) {
      if (l.confidence < CROSS_CONFIDENCE) continue;
      for (const run of digitRuns([l.text])) for (const c of scoreCandidates(run)) set.add(Number(c));
    }
    byGroup.set(groups[i], set);
  });
  const sets = [...byGroup.values()];
  if (sets.length < 2) return [];
  return [...sets[0]].filter((v) => sets.slice(1).every((s) => s.has(v)));
}

/** PaddleOCR の読みから結果を組み立てる。曲名で曲を特定し、ノーツ数が分かればスコア・判定・差分を合意で解く */
export function rawFromPaddle(r: PaddleReadings, master: readonly SongMasterEntry[]): RawResult | null {
  const titleTokens: OcrToken[] = r.title.flatMap((l) => l.text.split(/\s+/).filter(Boolean).map((text) => ({ text, confidence: l.confidence })));
  const scoreReadings = r.score.map((lines) => digitRuns(lines.map((l) => l.text)).flatMap(scoreCandidates));
  const scoreSet = new Set(scoreReadings.flat().map(Number).filter((n) => Number.isInteger(n)));
  const judge = r.judge ? judgeFromReads(r.judge, scoreSet) : undefined;
  const extras = judge && (judge.pg !== undefined || judge.gr !== undefined) ? { judge } : undefined;
  return rawFromRegions(titleTokens, scoreReadings, master, bestTitleLine(r.title, master) ?? undefined, extras, true, crossGroupValues(r.score, r.scoreGroups));
}
