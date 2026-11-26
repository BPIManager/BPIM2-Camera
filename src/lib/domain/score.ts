import type { BpiStatus, JudgeCounts } from "./types";

/** BPI を算出できる譜面レベル（BPIM2 の BPI 計算 API の対応範囲） */
export const BPI_SUPPORTED_LEVELS: readonly number[] = [11, 12];

export function isBpiSupportedLevel(level: number): boolean {
  return BPI_SUPPORTED_LEVELS.includes(level);
}

/** EX スコア = PGREAT×2 + GREAT。読み取りの検算に使う */
export function calcExScore(judge: Pick<JudgeCounts, "pgreat" | "great">): number {
  return judge.pgreat * 2 + judge.great;
}

export function verifyExScore(exScore: number, judge: Pick<JudgeCounts, "pgreat" | "great">): boolean {
  return calcExScore(judge) === exScore;
}

/** 判定 5 種の合計がノーツ数と一致するか（POOR は空打ちを含まない） */
export function verifyJudgeTotal(judge: JudgeCounts, notes: number): boolean {
  return judge.pgreat + judge.great + judge.good + judge.bad + judge.poor === notes;
}

export function isExScoreInRange(exScore: number, notes: number): boolean {
  return Number.isInteger(exScore) && exScore >= 0 && exScore <= notes * 2;
}

/** API 呼び出し前に BPI の算出可否を決める */
export function initialBpiStatus(level: number): BpiStatus {
  return isBpiSupportedLevel(level) ? "pending" : "unsupported-level";
}
