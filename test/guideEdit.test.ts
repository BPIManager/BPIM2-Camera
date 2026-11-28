import { describe, expect, it } from "vitest";
import { isValidRect, MIN_SIZE, moveRect, resizeRect } from "@/lib/vision/guideEdit";
import { GUIDE_KEYS, GUIDE_LAYOUTS, inferSide, migrateLegacyLayout, resolveLayout, toOtherSide } from "@/lib/vision/guides";

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
  const rect = (x: number) => ({ x, y: 0.1, width: 0.2, height: 0.1 });
  const full = { score: rect(0.1), title: rect(0.5), judge: rect(0.2) };

  it("キャリブレーション済みならそれを使い、なければ既定値（1P）", () => {
    expect(resolveLayout(full)).toEqual(full);
    expect(resolveLayout(null)).toEqual(GUIDE_LAYOUTS["1P"]);
  });

  it("スコア枠が左にあれば 1P、右にあれば 2P と推定する", () => {
    expect(inferSide(GUIDE_LAYOUTS["1P"])).toBe("1P");
    expect(inferSide(GUIDE_LAYOUTS["2P"])).toBe("2P");
  });
});

describe("migrateLegacyLayout", () => {
  const rect = (x: number) => ({ x, y: 0.1, width: 0.2, height: 0.1 });
  const full = { score: rect(0.1), title: rect(0.5), judge: rect(0.2) };

  it("プレー側の調整があればそれを使い、反対側だけならもう一方の側へ移し、なければ null", () => {
    expect(migrateLegacyLayout("1P", { "1P": full })).toEqual(full);
    expect(migrateLegacyLayout("2P", { "1P": full })).toEqual(toOtherSide(full, "1P"));
    expect(migrateLegacyLayout("1P", {})).toBeNull();
  });

  it("古い設定（スコアと曲名だけ）でも、足りない枠は既定値で補う", () => {
    const old = { score: rect(0.1), title: rect(0.5) };
    const r = migrateLegacyLayout("1P", { "1P": old })!;
    expect(r.score).toEqual(old.score);
    expect(r.judge).toEqual(GUIDE_LAYOUTS["1P"].judge);
  });

  it("既定の 3 枠は表示領域に収まり、2P はパネル（スコア・判定）を右へ、曲名を左下へ動かしたもの（左右反転ではない）", () => {
    for (const side of ["1P", "2P"] as const) {
      for (const k of GUIDE_KEYS) {
        const r = GUIDE_LAYOUTS[side][k];
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(1.0001);
        expect(r.y + r.height).toBeLessThanOrEqual(1.0001);
      }
    }
    const one = GUIDE_LAYOUTS["1P"], two = GUIDE_LAYOUTS["2P"];
    // パネルの中の並び（スコアと判定の位置関係）は同じ
    expect(two.judge.x - two.score.x).toBeCloseTo(one.judge.x - one.score.x);
    expect(two.judge.y - two.score.y).toBeCloseTo(one.judge.y - one.score.y);
    // 曲名は、パネルの左・下へ
    expect(two.title.x + two.title.width).toBeLessThanOrEqual(two.score.x + 0.0001);
    expect(two.title.y).toBeGreaterThan(one.title.y);
    expect(toOtherSide(two, "2P").score.x).toBeCloseTo(one.score.x);
  });
});
