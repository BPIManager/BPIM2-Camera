/** RGBA 画素列に対する前処理。OCR の入力用に「文字だけを残した白地に黒字」の画像を作る */
export type Variant = "contrast" | "white" | "cyan" | "bright";

export const VARIANTS: readonly Variant[] = ["white", "cyan", "contrast", "bright"];

type Pred = (r: number, g: number, b: number) => boolean;

const PREDICATES: Record<Exclude<Variant, "contrast">, Pred> = {
  /** 白い文字（判定数・曲名・ノーツ数・難易度表示） */
  white: (r, g, b) => Math.min(r, g, b) > 185,
  /** 今回スコアの水色の数字 */
  cyan: (r, g, b) => b > 170 && g > 130 && r < 110,
  /** 明るい色全般（黄・オレンジ・白のラベルや数字） */
  bright: (r, g, b) => Math.max(r, g, b) > 200 && r + g + b > 480,
};

/** 条件を満たす画素を黒、それ以外を白にする。文字が黒、背景が白で OCR に渡しやすい */
export function maskVariant(rgba: Uint8ClampedArray, variant: Variant): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length);
  if (variant === "contrast") {
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const y = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < rgba.length; i += 4) {
      const y = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
      const v = 255 - ((y - lo) * 255) / span;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
    return out;
  }
  const pred = PREDICATES[variant];
  for (let i = 0; i < rgba.length; i += 4) {
    const v = pred(rgba[i], rgba[i + 1], rgba[i + 2]) ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}
