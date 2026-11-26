import { describe, expect, it } from "vitest";
import { isValidRect, MIN_SIZE, moveRect, resizeRect } from "@/lib/vision/guideEdit";
import { GUIDE_LAYOUTS, mirrorLayout, resolveLayout } from "@/lib/vision/guides";

const r = { x: 0.3, y: 0.4, width: 0.2, height: 0.1 };

describe("moveRect", () => {
  it("動かした分だけ移動し、領域の外へは出ない", () => {
    const a = moveRect(r, 0.1, -0.1);
    expect([a.x, a.y]).toEqual([expect.closeTo(0.4), expect.closeTo(0.3)]);
    const hi = moveRect(r, 5, 5);
    expect([hi.x, hi.y]).toEqual([expect.closeTo(0.8), expect.closeTo(0.9)]);
    expect(moveRect(r, -5, -5)).toMatchObject({ x: 0, y: 0 });
  });
});

describe("resizeRect", () => {
  it("右下を引くと左上が固定されたまま拡大する", () => {
    const n = resizeRect(r, "se", 0.1, 0.05);
    expect(n).toMatchObject({ x: 0.3, y: 0.4 });
    expect(n.width).toBeCloseTo(0.3);
    expect(n.height).toBeCloseTo(0.15);
  });

  it("左上を引くと右下が固定されたまま縮小する", () => {
    const n = resizeRect(r, "nw", 0.05, 0.02);
    expect(n.x + n.width).toBeCloseTo(0.5);
    expect(n.y + n.height).toBeCloseTo(0.5);
  });

  it("最小サイズより小さくならず、領域の外へも広がらない", () => {
    const small = resizeRect(r, "se", -5, -5);
    expect(small.width).toBeCloseTo(MIN_SIZE);
    expect(small.height).toBeCloseTo(MIN_SIZE);
    const big = resizeRect(r, "se", 5, 5);
    expect(big.x + big.width).toBeCloseTo(1);
    expect(big.y + big.height).toBeCloseTo(1);
  });
});

describe("isValidRect", () => {
  it("範囲外・非数・小さすぎる枠は無効", () => {
    expect(isValidRect(r)).toBe(true);
    expect(isValidRect({ ...r, x: 0.9 })).toBe(false);
    expect(isValidRect({ ...r, width: 0.001 })).toBe(false);
    expect(isValidRect({ ...r, y: NaN })).toBe(false);
    expect(isValidRect(null)).toBe(false);
  });
});

describe("resolveLayout", () => {
  const custom = { score: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, title: { x: 0.5, y: 0.7, width: 0.4, height: 0.1 } };

  it("調整済みならそれを使い、なければ既定値", () => {
    expect(resolveLayout("1P", { "1P": custom })).toEqual(custom);
    expect(resolveLayout("2P", undefined)).toEqual(GUIDE_LAYOUTS["2P"]);
  });

  it("反対側だけ調整済みなら左右反転して使う", () => {
    expect(resolveLayout("2P", { "1P": custom })).toEqual(mirrorLayout(custom));
  });
});
