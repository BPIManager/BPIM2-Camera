import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { matchChart } from "@/lib/songs/matcher";
import { apply, findAnchors, fitSimilarity, type AnchorKind, type ScanLine } from "@/lib/vision/autoFrame";
import { CANONICAL_LAYOUT } from "@/lib/vision/autoFrameCanon";

/**
 * 2P の基準（取り込みの枠の自動推定）を作る: pnpm eval canon2p（先に fullScan2p）
 * 2P では、パネル（判定表・スコア欄など）はまとまりのまま右へ動き、曲名は左下へ動く。
 * 各写真で、パネルの手がかりを 1P の基準に重ねる変換を求め、曲名の手がかりを 1P の基準の座標に戻して中央値をとる。
 * 曲名の枠は、1P の曲名の枠を、曲名の手がかりと同じだけ動かす
 */
const TITLE_KINDS: AnchorKind[] = ["difficulty", "notes", "songTitle"];
it("canon 2p", () => {
  const master = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const titleScore = (text: string) => matchChart(master, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: text }).candidates[0]?.score ?? 0;
  const scan: Record<string, { width: number; height: number; lines: { text: string; confidence: number; x: number; y: number; w: number; h: number }[] }> = JSON.parse(readFileSync("internal/fullscan-2p.json", "utf8"));
  const shifts = new Map<AnchorKind, { x: number[]; y: number[] }>();
  for (const [f, v] of Object.entries(scan)) {
    const lines: ScanLine[] = v.lines.map((l) => ({ text: l.text, confidence: l.confidence, box: { x: l.x, y: l.y, width: l.w, height: l.h } }));
    const anchors = findAnchors(lines, v, titleScore);
    const panel = anchors.filter((a) => !TITLE_KINDS.includes(a.kind) && CANONICAL_LAYOUT.anchors[a.kind]);
    if (panel.length < 2) {
      console.log(f, "パネルの手がかりが足りない", anchors.map((a) => a.kind).join(","));
      continue;
    }
    // 写真 → 1P の基準
    const m = fitSimilarity(panel.map((a) => ({ x: a.x, y: a.y })), panel.map((a) => CANONICAL_LAYOUT.anchors[a.kind]!));
    for (const a of anchors.filter((a) => TITLE_KINDS.includes(a.kind))) {
      const p = apply(m, a);
      const e = shifts.get(a.kind) ?? { x: [], y: [] };
      e.x.push(p.x);
      e.y.push(p.y);
      shifts.set(a.kind, e);
    }
    console.log(f, "panel", panel.map((a) => a.kind).join(","), "title", anchors.filter((a) => TITLE_KINDS.includes(a.kind)).map((a) => a.kind).join(","), "scale", m.s.toFixed(3));
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const anchors2p: Record<string, { x: number; y: number }> = {};
  const dx: number[] = [];
  const dy: number[] = [];
  for (const [k, v] of shifts) {
    anchors2p[k] = { x: Math.round(median(v.x)), y: Math.round(median(v.y)) };
    const one = CANONICAL_LAYOUT.anchors[k];
    if (one) {
      dx.push(anchors2p[k]!.x - one.x);
      dy.push(anchors2p[k]!.y - one.y);
    }
    console.log(k, "n", v.x.length, anchors2p[k], "1P", one);
  }
  const t = CANONICAL_LAYOUT.frames.title;
  const title2p = { x: Math.round(t.x + median(dx)), y: Math.round(t.y + median(dy)), width: t.width, height: t.height };
  console.log("title frame 2P", title2p, "shift", median(dx), median(dy));
  writeFileSync("internal/canon2p.json", JSON.stringify({ anchors: anchors2p, title: title2p }, null, 1));
});
