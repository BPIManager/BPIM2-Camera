import type { BeatSeekerPreview } from "@/lib/beatSeeker/client";
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
 *   EX: nnnn (MAX-nnn)
 *   BPI: nn.nn (推定順位: nn位)
 * ランクの表記は、いちばん良い見せ方（AAA 以上は MAX-n、それより下は「AA+n / AAA-nnn」）。
 * BPI と推定順位は、算出できたときだけ載せる（☆10 以下は「算出対象外」なので省く）。
 */
export function buildShareText(r: ResultRecord, preview: BeatSeekerPreview | null = null): string {
  const lines = [chartLine(r), `EX: ${r.exScore} (${bestRankNotation(r.exScore, r.chart.notes * 2)})`];
  const rank = r.estimatedRank !== null ? `推定順位: ${r.estimatedRank}位` : null;
  if (r.bpiStatus === "calculated" && r.bpi !== null) lines.push(`BPI: ${r.bpi.toFixed(2)}${rank ? ` (${rank})` : ""}`);
  else if (rank) lines.push(rank);
  if (preview) lines.push(...ptLines(preview));
  return lines.join("\n");
}

const num = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const pt = (v: number | null) => (v === null ? "—" : num.format(v));
const signed = (v: number) => (v > 0 ? `+${num.format(v)}` : v < 0 ? `−${num.format(-v)}` : "±0");
const change = (c: { before: number | null; after: number | null }) => `${pt(c.before)} → ${pt(c.after)}`;

/**
 * beat-seeker 連携時の PT の変動。BEAT-PT・Rate-PT のそれぞれについて、単曲（この譜面）と総合の前 → 後を出す。
 *   BEAT-PT: 単曲 1,200 → 1,250 / 総合 10,000 → 10,012.5 (+12.5)
 * 単曲は対象外の譜面（chart が null）なら省く。単曲も総合も出せなければ、その行ごと省く
 */
export function ptLines(preview: BeatSeekerPreview): string[] {
  const lines: string[] = [];
  for (const [label, p] of [["BEAT-PT", preview.beatPt], ["Rate-PT", preview.ratePt]] as const) {
    const parts: string[] = [];
    if (p.chart) parts.push(`単曲 ${change(p.chart)}`);
    if (p.total.before !== null || p.total.after !== null)
      parts.push(`総合 ${change(p.total)}${p.total.delta !== null ? ` (${signed(p.total.delta)})` : ""}`);
    if (parts.length > 0) lines.push(`${label}: ${parts.join(" / ")}`);
  }
  return lines;
}
