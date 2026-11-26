import type { ResultRecord } from "@/lib/domain/types";
import { bestRankNotation } from "@/lib/domain/djRank";

const DIFF_SHORT = { BEGINNER: "B", NORMAL: "N", HYPER: "H", ANOTHER: "A", LEGGENDARIA: "L" } as const;

export const DEFAULT_SHARE_TEMPLATE = "標準";

/** 1 行目: ☆12 楽曲名[SPA] */
function chartLine(r: ResultRecord): string {
  const c = r.chart;
  return `☆${c.level} ${c.title}[${c.playStyle}${DIFF_SHORT[c.difficulty]}]`;
}

/**
 * シェア本文。
 *   ☆12 楽曲名[SPA]
 *   EX: nnnn (MAX-nnn) / BPI: nn.nn / 推定順位: nn位
 * ランクの表記は、いちばん良い見せ方（AAA 以上は MAX-n、それより下は「AA+n / AAA-nnn」）。
 * BPI と推定順位は、算出できたときだけ載せる（☆10 以下は「算出対象外」なので省く）。
 */
export function buildShareText(r: ResultRecord): string {
  const parts = [`EX: ${r.exScore} (${bestRankNotation(r.exScore, r.chart.notes * 2)})`];
  if (r.bpiStatus === "calculated" && r.bpi !== null) parts.push(`BPI: ${r.bpi.toFixed(2)}`);
  if (r.estimatedRank !== null) parts.push(`推定順位: ${r.estimatedRank}位`);
  return [chartLine(r), parts.join(" / ")].join("\n");
}
