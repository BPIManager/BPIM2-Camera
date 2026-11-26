import { describe, expect, it } from "vitest";
import { locateScoreChains, uniformity } from "@/lib/recognition/glyphs/locate";

const W = 600;
const H = 800;

function canvas() {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([10, 10, 20, 255], i);
  const rect = (x: number, y: number, w: number, h: number, c: [number, number, number]) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rgba.set([...c, 255], (yy * W + xx) * 4);
  };
  return { rgba, rect };
}

const BRIGHT: [number, number, number] = [20, 235, 255];
const DIM: [number, number, number] = [30, 150, 190];

describe("locateScoreChains", () => {
  it("数字の右に並んだバッジ（水色の塊）を巻き込んでも、数字だけの 4 桁を最上位にする", () => {
    const { rgba, rect } = canvas();
    // 4 桁の数字（幅 20・高さ 30・ピッチ 28）
    for (let i = 0; i < 4; i++) rect(100 + i * 28, 150, 20, 30, BRIGHT);
    // 右隣のバッジ（高さが同程度で、間隔が不揃い）
    rect(100 + 4 * 28 + 14, 144, 26, 28, BRIGHT);
    const [top] = locateScoreChains(rgba, W, H);
    expect(top.boxes).toHaveLength(4);
    expect(top.box.x).toBe(100);
    expect(top.box.width).toBe(3 * 28 + 20);
  });

  it("暗い青のラベル文字より、明るい水色の数字を優先する", () => {
    const { rgba, rect } = canvas();
    for (let i = 0; i < 3; i++) rect(80 + i * 26, 60, 18, 28, DIM); // ラベル風（3 つ・暗い）
    for (let i = 0; i < 4; i++) rect(300 + i * 28, 250, 20, 30, BRIGHT); // 数字（4 つ・明るい）
    const [top] = locateScoreChains(rgba, W, H);
    expect(top.box.y).toBe(250);
    expect(top.boxes).toHaveLength(4);
  });

  it("水色が無ければ候補なし", () => {
    expect(locateScoreChains(canvas().rgba, W, H)).toEqual([]);
  });
});

describe("uniformity", () => {
  const box = (x0: number, h: number) => ({ x0, x1: x0 + 19, y0: 0, y1: h - 1, area: 100 });

  it("等間隔・同じ高さなら 1、間隔や高さが乱れると下がる", () => {
    expect(uniformity([box(0, 30), box(28, 30), box(56, 30), box(84, 30)])).toBeCloseTo(1);
    expect(uniformity([box(0, 30), box(28, 30), box(56, 30), box(130, 14)])).toBeLessThan(0.5);
  });
});
