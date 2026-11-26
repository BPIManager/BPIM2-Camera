import type { OcrLine } from "./engine";
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

/** 数字の行から、1〜4 桁の数字の塊を取り出す（スコア欄の読み） */
export function digitRuns(lines: readonly string[]): string[] {
  return lines.flatMap((l) => l.replace(/[Oo]/g, "0").match(/[0-9]+/g) ?? []);
}

/** 位置が近い行を同じ行にまとめる（PaddleOCR は「GREAT」と数字を別の行に分けることがある） */
function groupRows(lines: readonly OcrLine[]): OcrLine[][] {
  const sorted = [...lines].filter((l) => l.text.trim()).sort((a, b) => a.box.y + a.box.height / 2 - (b.box.y + b.box.height / 2));
  const rows: { yc: number; h: number; items: OcrLine[] }[] = [];
  for (const l of sorted) {
    const yc = l.box.y + l.box.height / 2;
    const row = rows.find((r) => Math.abs(r.yc - yc) <= 0.45 * Math.max(r.h, l.box.height));
    if (row) {
      row.items.push(l);
      row.yc = (row.yc * (row.items.length - 1) + yc) / row.items.length;
    } else rows.push({ yc, h: l.box.height, items: [l] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.box.x - b.box.x));
}

const GREAT_LABEL = /[GC]R[EA3]{1,2}T|ONGAT|PGREAT|REAT/;

/** 行の数字（最も桁数の多い 1〜4 桁の塊）。ラベルの綴りの O などは数字に寄せない */
function rowNumber(items: readonly OcrLine[]): number | null {
  const runs = items.map((i) => trailingNumber(i.text)).filter((n): n is number => n !== null);
  return runs.length ? runs[runs.length - 1] : null;
}

/** 位置を使って判定表を読む。PGREAT（上）・GREAT（下）の 2 行を、ラベルと並び順から見つける */
export function parseJudgeRows(lines: readonly OcrLine[]): Judge {
  const rows = groupRows(lines).map((items) => ({ label: items.map((i) => i.text).join(" ").toUpperCase().replace(/\s+/g, ""), n: rowNumber(items) }));
  const out: Judge = {};
  const great = rows.flatMap((r, i) => (GREAT_LABEL.test(r.label) ? [i] : []));
  if (great.length >= 2) {
    out.pg = rows[great[0]].n ?? undefined;
    out.gr = rows[great[1]].n ?? undefined;
  } else if (great.length === 1) {
    const i = great[0];
    out.gr = rows[i].n ?? undefined;
    // PGREAT のラベルが読めないときは、すぐ上の行を PG とみなす
    const above = rows[i - 1];
    if (above?.n !== null && above?.n !== undefined && above.n >= 3) out.pg = above.n;
  }
  const rest = (k: "gd" | "bd" | "poor", re: RegExp) => {
    const r = rows.find((x) => re.test(x.label) && x.n !== null);
    if (r?.n !== null && r?.n !== undefined) out[k] = r.n;
  };
  rest("gd", /GOO[D0]/);
  rest("bd", /^B[A4]D/);
  rest("poor", /^P[O0]{2}R/);
  return out;
}

/**
 * スコア欄の読みから候補の数字を作る。先頭に余計な 1 桁が付く読み（`02382`・`52316`）に備え、
 * 先頭の 0 を除いた値と末尾 4 桁も候補にする。正しいかどうかは検算で決める。
 */
export function scoreCandidates(run: string): string[] {
  const out = new Set<string>();
  if (run.length <= 4) out.add(run);
  const stripped = run.replace(/^0+/, "");
  if (stripped.length >= 1 && stripped.length <= 4) out.add(stripped);
  if (run.length === 5) out.add(run.slice(1));
  return [...out];
}
