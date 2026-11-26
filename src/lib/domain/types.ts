export type PlayStyle = "SP" | "DP";
export type Difficulty = "BEGINNER" | "NORMAL" | "HYPER" | "ANOTHER" | "LEGGENDARIA";

export const CLEAR_TYPES = [
  "NO PLAY",
  "FAILED",
  "ASSIST CLEAR",
  "EASY CLEAR",
  "CLEAR",
  "HARD CLEAR",
  "EX HARD CLEAR",
  "FULLCOMBO CLEAR",
] as const;
export type ClearType = (typeof CLEAR_TYPES)[number];

export type DjLevel = "AAA" | "AA" | "A" | "B" | "C" | "D" | "E" | "F";

/** 判定内訳。PGREAT〜POOR と FAST/SLOW */
export interface JudgeCounts {
  pgreat: number;
  great: number;
  good: number;
  bad: number;
  poor: number;
  fast: number | null;
  slow: number | null;
}

/**
 * BPI の算出状態。
 * - calculated: API で算出済み
 * - unsupported-level: ☆10以下など BPI 算出対象外
 * - pending: 通信できず未算出（復帰後に計算）
 * - error: 曲未登録・ノーツ数不一致などで算出できなかった
 */
export type BpiStatus = "calculated" | "unsupported-level" | "pending" | "error";

export interface ScoreRead<T> {
  value: T;
  /** 0〜1。読み取り器が返す項目別の確信度 */
  confidence: number;
}

/** 読み取り器の出力（曲確定前） */
export interface RawResult {
  playStyle: PlayStyle;
  difficulty: Difficulty | null;
  level: number | null;
  notes: number | null;
  titleText: string | null;
  exScore: ScoreRead<number | null>;
  bestExScore: number | null;
  judge: JudgeCounts | null;
  missCount: number | null;
  bestMissCount: number | null;
  clearType: ClearType | null;
  bestClearType: ClearType | null;
  djLevel: DjLevel | null;
  useOption: string | null;
  isNewRecord: boolean;
}

/** 曲確定後の結果。履歴・シェア・統計送信の単位 */
export interface ChartRef {
  songId: number;
  title: string;
  playStyle: PlayStyle;
  difficulty: Difficulty;
  level: number;
  notes: number;
}

export interface ResultRecord {
  id: string;
  createdAt: number;
  chart: ChartRef;
  exScore: number;
  bestExScore: number | null;
  judge: JudgeCounts | null;
  missCount: number | null;
  bestMissCount: number | null;
  clearType: ClearType | null;
  bestClearType: ClearType | null;
  djLevel: DjLevel | null;
  useOption: string | null;
  /** BPI。算出対象外・未算出のときは null */
  bpi: number | null;
  bpiStatus: BpiStatus;
  estimatedRank: number | null;
  source: "camera" | "import";
  /** 手で修正した項目名。統計の学習データに使う */
  correctedFields: string[];
  imageKey: string | null;
}
