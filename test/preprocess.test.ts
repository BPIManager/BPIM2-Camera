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
