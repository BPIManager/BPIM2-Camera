import type { Gray } from "./frame";

/** 探す角度の範囲（度）。これより傾いた写真は、補正しても読めない */
export const MAX_TILT = 15;

export interface Tilt {
  /** 時計回りに回せば文字の行が水平になる角度（度）。0 なら補正不要 */
  angle: number;
  /** 補正の確からしさ。水平（0 度）のときの行の締まりに対する、最良の角度の比（1 に近いほど、傾いていても差がない） */
  gain: number;
}

/**
 * 切り出した枠の、文字の行の傾きを推定する。
 * 明るい画素（文字・帯）を、角度ごとに行へ投影し、行ごとの集まり方がいちばん鋭くなる角度を選ぶ（投影プロファイル法）。
 * 文字の行が水平にそろうと、行ごとの画素数の差が最大になる。縮小した画像で行うので軽い。
 */
export function estimateTilt(g: Gray): Tilt {
  const { width: w, height: h, data } = g;
  // 明るい上位の画素（文字は背景より明るい）
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const keep = Math.floor(data.length * 0.2);
  let thr = 255;
  for (let acc = 0; thr > 0 && (acc += hist[thr]) < keep; thr--);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x] >= thr) (xs.push(x), ys.push(y));
  if (xs.length < 30) return { angle: 0, gain: 1 };

  const bins = new Float64Array(w + h + 4);
  const score = (deg: number): number => {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    bins.fill(0);
    const off = w * Math.abs(s) + 2;
    for (let i = 0; i < xs.length; i++) bins[Math.floor(ys[i] * c + xs[i] * s + off)]++;
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i] * bins[i];
    return sum;
  };

  let best = 0;
  let bestScore = score(0);
  const zero = bestScore;
  for (let a = -MAX_TILT; a <= MAX_TILT; a += 1) {
    const sc = score(a);
    if (sc > bestScore) (bestScore = sc, (best = a));
  }
  // 1 度刻みで見つけた周りを、0.25 度刻みで詰める
  const coarse = best;
  for (let a = coarse - 0.75; a <= coarse + 0.75; a += 0.25) {
    const sc = score(a);
    if (sc > bestScore) (bestScore = sc, (best = a));
  }
  return { angle: best, gain: bestScore / zero };
}
