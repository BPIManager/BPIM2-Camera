import { describe, expect, it } from "vitest";
import { estimateTilt } from "@/lib/vision/deskew";
import type { Gray } from "@/lib/vision/frame";

/** 傾き deg の横縞（文字の行に見立てる）。deg が正なら、右へ行くほど縞が上がる（時計回りに回せば水平） */
function stripes(deg: number, w = 320, h = 120): Gray {
  const r = (deg * Math.PI) / 180;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = ((y * Math.cos(r) + x * Math.sin(r)) % 14 + 14) % 14 < 4 ? 240 : 30;
  return { width: w, height: h, data };
}

describe("estimateTilt", () => {
  it("水平な行は 0 度", () => {
    expect(Math.abs(estimateTilt(stripes(0)).angle)).toBeLessThan(0.75);
  });
  it.each([-9, -4, 4, 9, 12])("傾き %i 度の行を、±1 度で言い当てる", (deg) => {
    expect(estimateTilt(stripes(deg)).angle).toBeCloseTo(deg, 0);
  });
  it("明るい画素が少なすぎるときは補正しない", () => {
    expect(estimateTilt({ width: 20, height: 20, data: new Uint8Array(400) }).angle).toBe(0);
  });
});
