import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { rawFromRegions } from "../fromRegions";
import type { OcrToken } from "../tokens";
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

/** PaddleOCR の読みから結果を組み立てる。曲名で曲を特定し、ノーツ数が分かればスコア・判定・差分を合意で解く */
export function rawFromPaddle(r: PaddleReadings, master: readonly SongMasterEntry[]): RawResult | null {
  const titleTokens: OcrToken[] = r.title.flatMap((l) => l.text.split(/\s+/).filter(Boolean).map((text) => ({ text, confidence: l.confidence })));
  const scoreReadings = r.score.map((lines) => digitRuns(lines.map((l) => l.text)));
  const judge = r.judge ? parseJudgeRows(r.judge) : undefined;
  const rankGap = r.rank ? parseRankGap(r.rank.map((l) => l.text)) : undefined;
  const hasExtras = (judge && (judge.pg !== undefined || judge.gr !== undefined)) || rankGap;
  const extras = hasExtras ? { ...(judge ? { judge } : {}), ...(rankGap ? { rankGap } : {}) } : undefined;
  return rawFromRegions(titleTokens, scoreReadings, master, pickTitleLine(r.title) ?? undefined, extras);
}
