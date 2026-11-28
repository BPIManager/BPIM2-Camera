import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import BeatSeekerTab from "@/features/result/BeatSeekerTab";
import type { BeatSeekerPreview, PtChange } from "@/lib/beatSeeker/client";

/** beat-seeker タブの見た目を、静的な HTML にする（ヘッドレスの Chrome でスクリーンショットを撮る用）。HEIGHTS=330,250 で、タブの高さ（px）を選ぶ: OUT=<path> pnpm eval renderTab */
const pt = (before: number, after: number, tier: [string, string]): PtChange => ({ chart: { before: 139.5, after: 140.2 }, total: { before, after, delta: Math.round((after - before) * 100) / 100 }, tier: { before: tier[0], after: tier[1] } });
const make = (b: PtChange, r: PtChange): BeatSeekerPreview => ({ chart: { title: "冥", level: 12, unofficialLevel: "12.8" }, improved: { exScore: true, clearType: false, missCount: false }, willUpdate: true, beatPt: b, ratePt: r });

it("render tab", () => {
  const cases: [string, BeatSeekerPreview][] = [
    ["同じティアの中で伸びた（Master II）", make(pt(16650, 16662.5, ["Master II", "Master II"]), pt(500, 530, ["Veteran II", "Veteran III"]))],
    ["ティアが上がった（Master V → Ancient I）", make(pt(16985, 17012.5, ["Master V", "Ancient I"]), pt(3100, 3260, ["Elite V", "Master I"]))],
  ];
  const heights = (process.env.HEIGHTS ?? "330").split(",").map(Number);
  const html = heights.flatMap((h) => cases.map(([name, p]) => `<p class="mt-3 mb-1 text-xs text-muted-foreground">${name}（タブの高さ ${h}px）</p><div class="relative overflow-y-auto rounded-md border border-dashed border-border px-3 pt-2" style="height:${h}px">${renderToStaticMarkup(createElement(BeatSeekerTab, { state: { kind: "ok", preview: p } }))}</div>`)).join("");
  writeFileSync(process.env.OUT ?? "internal/tab.html", `<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>body{margin:0;padding:8px;width:344px;font-family:system-ui,"Yu Gothic UI",sans-serif}</style></head><body class="bg-background text-foreground">${html}</body></html>`);
});
