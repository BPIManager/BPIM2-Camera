import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { matchChart } from "@/lib/songs/matcher";
import { rawFromRegions } from "../fromRegions";
import { parseChartHints, type OcrToken } from "../tokens";
import type { OcrLine } from "./engine";
import { digitRuns, parseJudgeRows, parseRankGap, scoreCandidates } from "./parse";

export interface PaddleReadings {
  /** 曲名・譜面の枠の行 */
  title: readonly OcrLine[];
  /** スコア欄の読み。前処理ごとに 1 件 */
  score: readonly (readonly OcrLine[])[];
  judge?: readonly OcrLine[];
  rank?: readonly OcrLine[];
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

/** PaddleOCR の読みから結果を組み立てる。曲名で曲を特定し、ノーツ数が分かればスコア・判定・差分を合意で解く */
export function rawFromPaddle(r: PaddleReadings, master: readonly SongMasterEntry[]): RawResult | null {
  const titleTokens: OcrToken[] = r.title.flatMap((l) => l.text.split(/\s+/).filter(Boolean).map((text) => ({ text, confidence: l.confidence })));
  const scoreReadings = r.score.map((lines) => digitRuns(lines.map((l) => l.text)).flatMap(scoreCandidates));
  const judge = r.judge ? parseJudgeRows(r.judge) : undefined;
  const rankGap = r.rank ? parseRankGap(r.rank.map((l) => l.text)) : undefined;
  const hasExtras = (judge && (judge.pg !== undefined || judge.gr !== undefined)) || rankGap;
  const extras = hasExtras ? { ...(judge ? { judge } : {}), ...(rankGap ? { rankGap } : {}) } : undefined;
  return rawFromRegions(titleTokens, scoreReadings, master, bestTitleLine(r.title, master) ?? undefined, extras, true);
}
