import type { ResultRecord } from "@/lib/domain/types";

const DIFF_SHORT = { BEGINNER: "B", NORMAL: "N", HYPER: "H", ANOTHER: "A", LEGGENDARIA: "L" } as const;

export const DEFAULT_SHARE_TEMPLATE = "標準";

function chartLabel(r: ResultRecord): string {
  const c = r.chart;
  return `${c.title} [${c.playStyle}${DIFF_SHORT[c.difficulty]}☆${c.level}]`;
}

function exLine(r: ResultRecord): string {
  const base = `EX ${r.exScore}`;
  const diff =
    r.bestExScore === null
      ? ""
      : r.exScore > r.bestExScore
        ? `（更新 +${r.exScore - r.bestExScore}）`
        : r.exScore === r.bestExScore
          ? "（タイ）"
          : `（ベスト ${r.bestExScore}）`;
  return `${base}${diff}${r.djLevel ? ` ${r.djLevel}` : ""}`;
}

/**
 * シェア本文。BPI は算出できたときだけ載せる（☆10以下は「算出対象外」なので行ごと省く）。
 */
export function buildShareText(r: ResultRecord): string {
  const lines: string[] = [chartLabel(r), exLine(r)];
  if (r.bpiStatus === "calculated" && r.bpi !== null) lines.push(`BPI ${r.bpi.toFixed(2)}`);

  const lamp = r.clearType ? `${r.clearType.replace(" CLEAR", "")}` : null;
  const bp = r.missCount !== null ? `BP ${r.missCount}` : null;
  const second = [lamp, bp].filter(Boolean).join(" / ");
  if (second) lines.push(second);

  if (r.judge) {
    const j = r.judge;
    lines.push(`PG ${j.pgreat} / GR ${j.great} / GD ${j.good} / BD ${j.bad} / PR ${j.poor}`);
  }
  lines.push("#IIDX #BPI");
  return lines.join("\n");
}
