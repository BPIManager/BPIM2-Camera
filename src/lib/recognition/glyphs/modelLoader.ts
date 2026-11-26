import type { DigitModel } from "./classifier";
import { GLYPH_H, GLYPH_W } from "./segment";

export const DIGIT_MODEL_URL = `${import.meta.env.BASE_URL}models/digits.json`;

let cached: Promise<DigitModel | null> | null = null;

/** 学習済みの数字モデルを読み込む。無い・壊れている・寸法違いなら null（Tesseract だけで読む） */
export function loadDigitModel(fetchImpl: typeof fetch = fetch): Promise<DigitModel | null> {
  cached ??= fetchImpl(DIGIT_MODEL_URL)
    .then(async (res) => {
      if (!res.ok) return null;
      const m = (await res.json()) as DigitModel;
      return m.width === GLYPH_W && m.height === GLYPH_H && Array.isArray(m.templates) && m.templates.length > 0 ? m : null;
    })
    .catch(() => null);
  return cached;
}
