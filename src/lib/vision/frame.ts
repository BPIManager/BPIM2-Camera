export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

/** RGBA → 輝度（縮小画像での自動撮影判定に使う） */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return { width, height, data };
}

/** ラプラシアン分散。小さいほどピンボケ・ブレ */
export function sharpness(g: Gray): number {
  const { width: w, height: h, data } = g;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** 2 フレームの平均絶対差（0〜255）。小さいほど静止 */
export function frameDiff(a: Gray, b: Gray): number {
  if (a.width !== b.width || a.height !== b.height) return 255;
  let total = 0;
  for (let i = 0; i < a.data.length; i++) total += Math.abs(a.data[i] - b.data[i]);
  return total / a.data.length;
}
