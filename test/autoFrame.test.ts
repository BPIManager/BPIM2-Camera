import { describe, expect, it } from "vitest";
import { apply, findAnchors, fitFrames, fitSimilarity, type ScanLine, type Similarity } from "@/lib/vision/autoFrame";
import { CANONICAL_LAYOUT } from "@/lib/vision/autoFrameCanon";

const line = (text: string, x: number, y: number, width = 60, height = 16): ScanLine => ({ text, confidence: 90, box: { x, y, width, height } });

describe("fitSimilarity", () => {
  it("拡大・回転・移動した点の組から、もとの変換を求める", () => {
    const m: Similarity = { s: 0.7, cos: Math.cos(0.1), sin: Math.sin(0.1), tx: 40, ty: -25 };
    const from = [
      { x: 10, y: 20 },
      { x: 300, y: 40 },
      { x: 120, y: 500 },
      { x: 800, y: 900 },
    ];
    const got = fitSimilarity(from, from.map((p) => apply(m, p)));
    expect(got.s).toBeCloseTo(0.7, 6);
    expect(got.sin).toBeCloseTo(Math.sin(0.1), 6);
    expect(got.tx).toBeCloseTo(40, 4);
    expect(got.ty).toBeCloseTo(-25, 4);
  });
});

describe("findAnchors", () => {
  const size = { width: 1080, height: 1920 };
  it("判定の見出しを見つけ、GREAT は上から PG・GR とする", () => {
    const a = findAnchors([line("GREAT 1095", 300, 1030), line("GREAT", 300, 1000), line("POOR", 305, 1100)], size);
    const great = a.filter((x) => x.kind.startsWith("great")).sort((p, q) => p.y - q.y);
    expect(great.map((g) => g.kind)).toEqual(["great1", "great2"]);
    expect(a.some((x) => x.kind === "poor")).toBe(true);
  });

  it("項目名は、左が切れていても右端を使う。使う端が画像の端に接していれば使わない", () => {
    const a = findAnchors([line("S COUNT", 100, 900), line("RANDOM", 0, 400), line("NOTES", 1020, 1150, 60)], size);
    expect(a.find((x) => x.kind === "missCount")?.x).toBe(160);
    // NOTES は右端を使うが、画像の右端に接している
    expect(a.some((x) => x.kind === "notes")).toBe(false);
  });

  it("画面の表記（SCORE など）は、同じ名前の曲があっても曲名とみなさない", () => {
    const score = (t: string) => (t === "SCORE" || t === "HARD BRAIN" ? 1 : 0);
    const a = findAnchors([line("SCORE", 50, 850), line("HARD BRAIN", 700, 1110, 250)], size, score);
    const title = a.find((x) => x.kind === "songTitle");
    expect(title).toEqual({ kind: "songTitle", x: 950, y: 1118 });
  });
});

describe("fitFrames", () => {
  it("基準の手がかりを縮小・移動した画像では、枠も同じだけ縮小・移動して置く", () => {
    const m: Similarity = { s: 0.5, cos: 1, sin: 0, tx: 100, ty: 50 };
    const size = { width: 800, height: 1200 };
    const anchors = Object.entries(CANONICAL_LAYOUT.anchors).map(([kind, p]) => ({ kind: kind as never, ...apply(m, p!) }));
    const fit = fitFrames(anchors, CANONICAL_LAYOUT, size)!;
    expect(fit).not.toBeNull();
    const f = CANONICAL_LAYOUT.frames.judge;
    expect(fit.layout.judge.x).toBeCloseTo((f.x * 0.5 + 100) / 800, 3);
    expect(fit.layout.judge.height).toBeCloseTo((f.height * 0.5) / 1200, 3);
  });

  it("読み違えた手がかりは外して当てはめる", () => {
    const m: Similarity = { s: 0.8, cos: 1, sin: 0, tx: 0, ty: 0 };
    const anchors = Object.entries(CANONICAL_LAYOUT.anchors).map(([kind, p]) => ({ kind: kind as never, ...apply(m, p!) }));
    anchors[0] = { ...anchors[0]!, x: anchors[0]!.x + 400 };
    const fit = fitFrames(anchors, CANONICAL_LAYOUT, { width: 1080, height: 1920 })!;
    expect(fit.used).toBe(anchors.length - 1);
    expect(fit.transform.s).toBeCloseTo(0.8, 3);
  });

  it("手がかりが足りなければ null", () => {
    expect(fitFrames([{ kind: "poor", x: 10, y: 10 }], CANONICAL_LAYOUT, { width: 100, height: 100 })).toBeNull();
  });
});
