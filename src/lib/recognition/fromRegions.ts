import type { RawResult } from "@/lib/domain/types";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { guessTitle } from "./fromTokens";
import { voteScore } from "./scoreVote";
import { parseChartHints, type OcrToken } from "./tokens";

/**
 * 曲名帯のトークンとスコア枠の読み取り結果から結果を組み立てる。
 * EX は複数回の読み取りが一致し、かつ譜面のノーツ数から見て範囲内のときだけ確定する。
 */
export function rawFromRegions(
  titleTokens: readonly OcrToken[],
  scoreReadings: readonly (readonly string[])[],
  master: readonly SongMasterEntry[],
): RawResult | null {
  const hints = parseChartHints(titleTokens);
  const titleText = guessTitle(titleTokens);
  const match = matchChart(master, { ...hints, titleText });
  // 曲名の弱い一致で範囲を狭めると正しい EX まで除外するので、確定した譜面のノーツ数だけを使う
  const notes = hints.notes ?? (match.confident ? match.candidates[0].entry.notes : null);
  const vote = voteScore(scoreReadings, notes);
  if (hints.difficulty === null && hints.notes === null && titleText === null && vote.candidates.length === 0) return null;

  return {
    playStyle: hints.playStyle,
    difficulty: hints.difficulty,
    level: hints.level,
    notes: hints.notes,
    titleText,
    exScore: vote.value !== null ? { value: vote.value, confidence: 0.9 } : { value: null, confidence: vote.candidates.length ? 0.3 : 0 },
    bestExScore: null,
    judge: null,
    missCount: null,
    bestMissCount: null,
    clearType: null,
    bestClearType: null,
    djLevel: null,
    useOption: null,
    isNewRecord: false,
    exCandidates: vote.value !== null ? [] : vote.candidates,
  };
}
