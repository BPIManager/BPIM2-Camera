import { chainGlyphs, components, mergeFragments } from "../glyphs/segment";

/**
 * 色で抜き出した画像（文字が黒・背景が白）から、数字の列だけを残す。
 * 数字のすぐ隣にある NEW RECORD のバッジ（水色）などは、数字とは大きさや高さが合わず、列に入らないので消える。
 * 数字の列が見つからなければ（3 桁未満）、そのまま返す。
 */
export function isolateDigitRow(px: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4] === 0 ? 1 : 0;
  const boxes = mergeFragments(components(mask, w, h)).filter((b) => b.area >= 20 && b.y1 - b.y0 + 1 >= h * 0.15);
  const chain = chainGlyphs(boxes)[0];
  if (!chain || chain.length < 3) return px;

  const avgH = chain.reduce((a, b) => a + (b.y1 - b.y0 + 1), 0) / chain.length;
  const x0 = Math.min(...chain.map((b) => b.x0)) - 0.3 * avgH;
  const x1 = Math.max(...chain.map((b) => b.x1)) + 0.3 * avgH;
  const y0 = Math.min(...chain.map((b) => b.y0)) - 0.4 * avgH;
  const y1 = Math.max(...chain.map((b) => b.y1)) + 0.4 * avgH;

  const out = new Uint8ClampedArray(px.length);
  out.fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const i = (y * w + x) * 4;
      out[i] = px[i];
      out[i + 1] = px[i + 1];
      out[i + 2] = px[i + 2];
    }
  }
  return out;
}
