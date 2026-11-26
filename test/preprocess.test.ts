import { describe, expect, it } from "vitest";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";

const px = (...c: number[]) => new Uint8ClampedArray([...c, 255]);

describe("maskVariant", () => {
  it("white は白い画素だけを黒（文字）にする", () => {
    expect(maskVariant(px(240, 240, 240), "white")[0]).toBe(0);
    expect(maskVariant(px(240, 100, 100), "white")[0]).toBe(255);
  });

  it("cyan は今回スコアの水色だけを残す", () => {
    expect(maskVariant(px(20, 200, 240), "cyan")[0]).toBe(0);
    expect(maskVariant(px(240, 240, 240), "cyan")[0]).toBe(255);
  });

  it("contrast は明るい画素ほど黒く正規化する", () => {
    const out = maskVariant(new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 255]), "contrast");
    expect(out[0]).toBe(255);
    expect(out[4]).toBe(0);
  });
});

describe("cyanFill（スコアの水色の中身だけ）", () => {
  const px = (r: number, g: number, b: number) => maskVariant(new Uint8ClampedArray([r, g, b, 255]), "cyanFill")[0];
  it("明るい水色は文字として残す", () => expect(px(120, 215, 232)).toBe(0));
  it("暗い縁取り・白・ピンクの背景は除く", () => {
    expect(px(20, 90, 120)).toBe(255);
    expect(px(240, 240, 240)).toBe(255);
    expect(px(235, 140, 200)).toBe(255);
  });
});
