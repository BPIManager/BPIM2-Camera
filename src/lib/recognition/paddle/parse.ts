import type { Rank } from "../consensus/ranks";
import type { Observations } from "../consensus/engine";
import { toDigits } from "../tokens";

type Judge = NonNullable<Observations["judge"]>;

/** 行末の数字（OCR が取り違えやすい O/I などは数字に寄せる）。1〜4 桁 */
function trailingNumber(text: string): number | null {
  const m = /([0-9OoIl|SB]{1,4})\s*$/.exec(text.trim());
  if (!m) return null;
  const s = toDigits(m[1]);
  return /^[0-9]{1,4}$/.test(s) ? Number(s) : null;
}

/**
 * 判定表の行（`GREAT 1151` など）から PG・GR・GOOD・BAD・POOR を取り出す。
 * ラベルが読めない行は、PGREAT・GREAT・GOOD・BAD・POOR の並び順で補う。
 */
export function parseJudgeLines(lines: readonly string[]): Judge {
  const out: Judge = {};
  const greatRows: { n: number; pLabel: boolean }[] = [];
  for (const raw of lines) {
    const t = raw.toUpperCase().replace(/\s+/g, "");
    const n = trailingNumber(raw);
    if (n === null) continue;
    if (/GOO[D0]/.test(t)) out.gd ??= n;
    else if (/^BAD|^B[A4]D/.test(t)) out.bd ??= n;
    else if (/^POOR|^P[O0]{2}R/.test(t)) out.poor ??= n;
    else if (/[GC]R[EA3]{1,2}T/.test(t)) greatRows.push({ n, pLabel: /^P/.test(t) });
  }
  if (greatRows.length >= 2) {
    out.pg = greatRows[0].n;
    out.gr = greatRows[1].n;
  } else if (greatRows.length === 1) {
    if (greatRows[0].pLabel) out.pg = greatRows[0].n;
    else out.gr = greatRows[0].n;
  }
  return out;
}

const RANK_PATTERN = /(MAX|AAA|AA|A|B|C|D|E)\s*([+＋t十\-－−ー~])?\s*([0-9OoIl|]{4})\b/;

/** DJ LEVEL 行の差分（`AAA +0104`・`MAX -0007`）。数字は 4 桁そろった表示だけを採る */
export function parseRankGap(lines: readonly string[]): Observations["rankGap"] | undefined {
  for (const raw of lines) {
    const m = RANK_PATTERN.exec(raw.toUpperCase().replace(/\s+/g, " "));
    if (!m) continue;
    const gap = Number(toDigits(m[3]));
    if (!Number.isInteger(gap)) continue;
    const s = m[2];
    const sign = s === undefined ? null : /[+＋T十]/.test(s) ? "+" : "-";
    return { rank: m[1] as Rank, sign, gap };
  }
  return undefined;
}

/** 数字の行から、1〜4 桁の数字の塊を取り出す（スコア欄の読み） */
export function digitRuns(lines: readonly string[]): string[] {
  return lines.flatMap((l) => l.replace(/[Oo]/g, "0").match(/[0-9]+/g) ?? []);
}
