import type { RawResult } from "@/lib/domain/types";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { decideExScore, type Observations } from "./consensus/engine";
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
  /** 日本語 OCR で読んだ曲名の 1 行（文字ごとに分かれたトークンを連結したもの） */
  japaneseTitle?: string,
  /** スコア欄以外の独立した読み（ジャッジ表・DJ LEVEL 行の差分・ベストとの差分）。あれば合意で EX を決める */
  extras?: Omit<Observations, "notes" | "score">,
  /** true なら、独立した読みの合意でしか EX を確定しない（スコア欄の読みだけの多数決では確定しない） */
  requireConsensus = false,
  /** 前処理の違う複数の読みで、確度の高い読みが一致した値。合意がないときの代わりに、1 つに決まれば採る */
  crossValues: readonly number[] = [],
): RawResult | null {
  const hints = parseChartHints(titleTokens);
  const titleText = japaneseTitle?.trim() || guessTitle(titleTokens);
  // レベルの読み違い（II を 1 と読むなど）に備え、確定しなければレベルを外して照合し直す
  let match = matchChart(master, { ...hints, titleText });
  if (!match.confident && titleText) {
    const relaxed = matchChart(master, { ...hints, level: null, notes: null, titleText });
    if (relaxed.confident) match = relaxed;
  }
  // 曲名の弱い一致で範囲を狭めると正しい EX まで除外するので、確定した譜面のノーツ数だけを使う
  const notes = hints.notes ?? (match.confident ? match.candidates[0].entry.notes : null);
  const vote = voteScore(scoreReadings, notes);
  // 独立した読みが 2 つ以上そろえば合意で決める。足りなければ従来どおり、スコア欄の多数決だけで判断する
  const consensus =
    notes !== null && extras
      ? decideExScore({ notes, score: [...new Set(scoreReadings.flatMap((r) => r.map(Number).filter((n) => Number.isInteger(n))))], ...extras })
      : null;
  const cross = notes === null ? [] : [...new Set(crossValues)].filter((v) => v >= 100 && v <= notes * 2);
  const exValue = consensus?.status === "confirmed" ? consensus.value : requireConsensus ? (cross.length === 1 ? cross[0] : null) : vote.value;
  const exCandidates = exValue !== null ? [] : [...new Set([...(consensus?.ranked.map((c) => c.value) ?? []), ...vote.candidates])].slice(0, 3);
  if (hints.difficulty === null && hints.notes === null && titleText === null && vote.candidates.length === 0) return null;

  return {
    playStyle: hints.playStyle,
    difficulty: hints.difficulty,
    level: hints.level,
    notes: hints.notes,
    titleText,
    exScore: exValue !== null ? { value: exValue, confidence: consensus?.status === "confirmed" ? 0.97 : 0.9 } : { value: null, confidence: exCandidates.length ? 0.3 : 0 },
    bestExScore: null,
    judge: extras?.judge?.pg !== undefined && extras.judge.gr !== undefined ? { pgreat: extras.judge.pg, great: extras.judge.gr, good: extras.judge.gd ?? 0, bad: extras.judge.bd ?? 0, poor: extras.judge.poor ?? 0, fast: null, slow: null } : null,
    missCount: null,
    bestMissCount: null,
    clearType: null,
    bestClearType: null,
    djLevel: null,
    useOption: null,
    isNewRecord: false,
    exCandidates,
  };
}

/** 難易度・レベル・ノーツ数の読み取りだけで譜面が 1 件に絞れるか。絞れれば日本語 OCR は不要 */
export function chartResolvedByHints(titleTokens: readonly OcrToken[], master: readonly SongMasterEntry[]): boolean {
  const hints = parseChartHints(titleTokens);
  if (hints.notes === null || hints.difficulty === null || hints.level === null) return false;
  return matchChart(master, { ...hints, titleText: null }).confident;
}
