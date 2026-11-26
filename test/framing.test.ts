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

describe("guideToVideoRect のデジタルズーム", () => {
  const view = { width: 400, height: 800 };
  const video = { width: 1600, height: 1200 };

  it("倍率 1 は従来どおり。2 倍にすると、同じ枠が映像上では半分の大きさの範囲になる", () => {
    const guide = { x: 100, y: 300, width: 200, height: 100 };
    const a = guideToVideoRect(guide, view, video);
    const b = guideToVideoRect(guide, view, video, 2);
    expect(guideToVideoRect(guide, view, video, 1)).toEqual(a);
    expect(b.width).toBeCloseTo(a.width / 2, -1);
    expect(b.height).toBeCloseTo(a.height / 2, -1);
  });

  it("画面の中央は、何倍にしても映像の中央を指す", () => {
    const center = { x: 199, y: 399, width: 2, height: 2 };
    for (const z of [1, 2, 4]) {
      const r = guideToVideoRect(center, view, video, z);
      expect(r.x + r.width / 2).toBeCloseTo(video.width / 2, -1);
      expect(r.y + r.height / 2).toBeCloseTo(video.height / 2, -1);
    }
  });

  it("画面全体は、拡大するほど映像の中央の狭い範囲になり、映像の外にはみ出さない", () => {
    const whole = { x: 0, y: 0, width: view.width, height: view.height };
    const one = guideToVideoRect(whole, view, video, 1);
    const four = guideToVideoRect(whole, view, video, 4);
    expect(four.width).toBeLessThan(one.width);
    expect(four.x).toBeGreaterThanOrEqual(0);
    expect(four.x + four.width).toBeLessThanOrEqual(video.width);
    expect(four.y + four.height).toBeLessThanOrEqual(video.height);
  });
});
