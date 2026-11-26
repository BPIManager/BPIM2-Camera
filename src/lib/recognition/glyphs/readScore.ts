import { readNumber, type DigitModel } from "./classifier";
import { colorMask, isCyan, segmentGlyphs } from "./segment";

export interface GlyphScore {
  value: number;
  /** 全桁の確信度の最小値 */
  confidence: number;
}

/** モデルが見本を持つ数字の数。10 に満たないモデルは読めない桁がある */
export function modelCoverage(model: DigitModel): number {
  return new Set(model.templates.map((t) => t.digit)).size;
}

/**
 * スコア枠の画像から、水色の数字を桁ごとに切り出して分類し、数値にする。
 * 桁数が 1〜4 でなければ（飾りを拾った等）読めなかったことにする。
 */
export function readScoreByGlyphs(pixels: { data: Uint8ClampedArray; width: number; height: number }, model: DigitModel): GlyphScore | null {
  const mask = colorMask(pixels.data, isCyan);
  const glyphs = segmentGlyphs(mask, pixels.width, pixels.height);
  if (glyphs.length < 1 || glyphs.length > 4) return null;
  const r = readNumber(model, glyphs);
  return r ? { value: r.value, confidence: r.confidence } : null;
}
