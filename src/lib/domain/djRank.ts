/**
 * DJ ランクの境界（BPIM2 本体の rankBorders / djRank と同じ定義）。
 * 境界のスコアは、満点（ノーツ数 × 2）に比率を掛けて切り上げる。
 */
const RANK_TABLE = [
  { label: "F", ratio: 0 },
  { label: "E", ratio: 2 / 9 },
  { label: "D", ratio: 3 / 9 },
  { label: "C", ratio: 4 / 9 },
  { label: "B", ratio: 5 / 9 },
  { label: "A", ratio: 6 / 9 },
  { label: "AA", ratio: 7 / 9 },
  { label: "AAA", ratio: 8 / 9 },
  { label: "MAX-", ratio: 17 / 18 },
] as const;

const AAA_RATIO = 8 / 9;

const borderOf = (maxScore: number, ratio: number) => Math.ceil(maxScore * ratio);

/** チャートに破線で引く境界（A・AA・AAA・MAX-）。スコアは満点に対して切り上げ */
export function chartRankBorders(maxScore: number): { label: string; score: number }[] {
  return RANK_TABLE.filter((r) => ["A", "AA", "AAA", "MAX-"].includes(r.label)).map((r) => ({ label: r.label, score: borderOf(maxScore, r.ratio) }));
}

function rankDetail(ex: number, maxScore: number) {
  let current: (typeof RANK_TABLE)[number] = RANK_TABLE[0];
  let next: (typeof RANK_TABLE)[number] | undefined = RANK_TABLE[1];
  for (let i = 0; i < RANK_TABLE.length; i++) {
    if (ex >= borderOf(maxScore, RANK_TABLE[i].ratio)) {
      current = RANK_TABLE[i];
      next = RANK_TABLE[i + 1];
    } else {
      break;
    }
  }
  return {
    label: current.label,
    nextLabel: next ? next.label : "MAX",
    surplus: ex - borderOf(maxScore, current.ratio),
    shortage: (next ? borderOf(maxScore, next.ratio) : maxScore) - ex,
  };
}

/**
 * 現在のランクからの超過と、次のランクまでの不足（BPIM2 の表示と同じ）。例: current "AAA+12" / next "MAX-34"。
 * AAA 帯と MAX- 帯は、次を「満点までの不足」か「AAA からの超過」で出す（MAX- 境界との差は使わない）。
 */
export function djRankPair(ex: number, maxScore: number): { current: string; next: string } {
  const d = rankDetail(ex, maxScore);
  const aaaSurplus = ex - borderOf(maxScore, AAA_RATIO);
  const toMax = maxScore - ex;
  if (d.label === "MAX-") return { current: `MAX-${toMax}`, next: `AAA+${aaaSurplus}` };
  if (d.label === "AAA") return { current: `AAA+${aaaSurplus}`, next: `MAX-${toMax}` };
  const nextLabel = d.nextLabel.endsWith("-") ? d.nextLabel : `${d.nextLabel}-`;
  return { current: `${d.label}+${d.surplus}`, next: `${nextLabel}${d.shortage}` };
}

/**
 * シェアに載せる、いちばん良い見せ方の表記。
 * AAA 以上は、満点までの不足 `MAX-n`（最上位の表記）だけ。それより下は、現在のランクからの超過と、次のランクまでの距離 `AA+22 / AAA-89`。
 */
export function bestRankNotation(ex: number, maxScore: number): string {
  if (ex >= borderOf(maxScore, AAA_RATIO)) return `MAX-${maxScore - ex}`;
  const { current, next } = djRankPair(ex, maxScore);
  return `${current} / ${next}`;
}
