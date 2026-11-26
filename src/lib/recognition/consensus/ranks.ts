/** DJ LEVEL の段階。EX スコアが理論値（ノーツ数×2）に占める割合で決まる */
export const RANKS = ["F", "E", "D", "C", "B", "A", "AA", "AAA", "MAX"] as const;
export type Rank = (typeof RANKS)[number];

/** 各ランクの下限（理論値に対する 9 分率）。F は下限なし */
const NINTHS: Record<Rank, number> = { F: 0, E: 2, D: 3, C: 4, B: 5, A: 6, AA: 7, AAA: 8, MAX: 9 };

/** ランクの基準点（そのランクになる最小の EX スコア）。MAX は理論値そのもの */
export function rankThreshold(rank: Rank, notes: number): number {
  return Math.ceil((notes * 2 * NINTHS[rank]) / 9);
}

/** そのランクに属する EX の範囲（両端を含む）。MAX は理論値のみ */
export function rankRange(rank: Rank, notes: number): { min: number; max: number } {
  const max = notes * 2;
  if (rank === "MAX") return { min: max, max };
  const i = RANKS.indexOf(rank);
  const upper = rankThreshold(RANKS[i + 1], notes);
  return { min: rankThreshold(rank, notes), max: upper - 1 };
}

/** 基準点として差分表示に使われるランク。F は下限がなく基準点にならない */
export const GAP_RANKS: readonly Rank[] = ["E", "D", "C", "B", "A", "AA", "AAA", "MAX"];

/**
 * 画面の差分表示（`AAA +0104`・`MAX -0201`）は、EX に最も近い基準点との差を示す。
 * ex がその基準 rank に最も近いかを返す。
 */
export function isNearestBoundary(rank: Rank, ex: number, notes: number): boolean {
  const d = Math.abs(ex - rankThreshold(rank, notes));
  return GAP_RANKS.every((r) => d <= Math.abs(ex - rankThreshold(r, notes)));
}

/** EX から現在のランクを決める */
export function rankOf(ex: number, notes: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) if (ex >= rankThreshold(RANKS[i], notes)) return RANKS[i];
  return "F";
}
