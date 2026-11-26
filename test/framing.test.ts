import { describe, expect, it } from "vitest";
import { guideToVideoRect } from "@/lib/vision/framing";

describe("guideToVideoRect", () => {
  it("cover 表示でトリミングされた分を考慮して映像座標に直す", () => {
    // 映像 1920x1080 を 400x800 の縦長に cover 表示 → 高さ基準で scale=800/1080、左右が切れる
    const view = { width: 400, height: 800 };
    const guide = { x: 16, y: 300, width: 368, height: 245 };
    const r = guideToVideoRect(guide, view, { width: 1920, height: 1080 });
    const scale = 800 / 1080;
    expect(r.width).toBeCloseTo(guide.width / scale, -1);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.width).toBeLessThanOrEqual(1920);
  });

  it("映像の外にはみ出さない", () => {
    const r = guideToVideoRect({ x: -50, y: -50, width: 500, height: 500 }, { width: 400, height: 400 }, { width: 400, height: 400 });
    expect(r).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });
});
