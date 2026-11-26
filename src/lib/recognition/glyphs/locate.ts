import { chainGlyphs, colorMask, components, isCyan, mergeFragments, splitWide, type Box } from "./segment";

export interface LocatedChain {
  /** 画像上の外接矩形 */
  box: { x: number; y: number; width: number; height: number };
  boxes: Box[];
  /** 数字列らしさ（0〜1）。大きいほど数字列らしい */
  score: number;
}

/** 数字の高さが画像の高さに占める割合の許容範囲（飾り・大きな文字・ノイズを除く） */
const MIN_REL_HEIGHT = 0.012;
const MAX_REL_HEIGHT = 0.07;

/** 桁数ごとの事前の数字列らしさ。EX スコアは 3〜4 桁が大半で、4 桁が最も多い */
const LENGTH_PRIOR: Record<number, number> = { 2: 0.4, 3: 0.85, 4: 1, 5: 0.5 };

/** 連鎖から 1 個落とすごとの減点（同じ程度に数字らしければ、長い連鎖を優先する） */
const DROP_PENALTY = 0.9;

const cv = (xs: number[]): number => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 1;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) / mean;
};

/**
 * 並びの整い具合（0〜1）。数字は等幅フォントなので、高さと桁の中心の間隔がそろう。
 * バッジなど別物の塊が混ざると、間隔や高さが乱れて下がる。
 */
export function uniformity(boxes: readonly Box[]): number {
  const heights = boxes.map((b) => b.y1 - b.y0 + 1);
  const centers = boxes.map((b) => (b.x0 + b.x1) / 2);
  const gaps = centers.slice(1).map((c, i) => c - centers[i]);
  const pitch = gaps.length >= 2 ? cv(gaps) : 0;
  return Math.max(0, 1 - 2 * (cv(heights) + pitch));
}

/** 連鎖内の水色画素の平均の明るさ（0〜1）。数字は明るい水色で、ラベルやバッジは暗めになる */
function meanBrightness(rgba: Uint8ClampedArray, mask: Uint8Array, w: number, boxes: readonly Box[]): number {
  let sum = 0;
  let n = 0;
  for (const b of boxes) {
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (!mask[y * w + x]) continue;
        const i = (y * w + x) * 4;
        sum += Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
        n++;
      }
    }
  }
  return n ? sum / n : 0;
}

/** 明るさによる補正（0.5〜1）。明度 0.65 以下で 0.5、0.9 以上で 1 */
const brightnessFactor = (v: number): number => 0.5 + 0.5 * Math.min(1, Math.max(0, (v - 0.65) / 0.25));

function toChain(boxes: Box[], score: number): LocatedChain {
  const x0 = Math.min(...boxes.map((b) => b.x0));
  const y0 = Math.min(...boxes.map((b) => b.y0));
  const x1 = Math.max(...boxes.map((b) => b.x1));
  const y1 = Math.max(...boxes.map((b) => b.y1));
  return { box: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }, boxes, score };
}

/**
 * 枠に頼らず、画像全体から今回スコアの水色の数字列を探す。
 * 水色の成分を桁として連鎖させ、連鎖の連続する部分列（バッジなどを巻き込んだ分を落としたもの）も候補にして、
 * 桁数の事前分布と並びの整い具合で評価する。数字列らしい順に返す。
 */
export function locateScoreChains(rgba: Uint8ClampedArray, w: number, h: number, limit = 8): LocatedChain[] {
  const mask = colorMask(rgba, isCyan);
  const boxes = mergeFragments(components(mask, w, h))
    .flatMap((b) => splitWide(mask, w, b))
    .filter((b) => {
      const bh = b.y1 - b.y0 + 1;
      const bw = b.x1 - b.x0 + 1;
      return bh >= h * MIN_REL_HEIGHT && bh <= h * MAX_REL_HEIGHT && bw / bh <= 1.8 && b.area >= 20;
    })
    .sort((a, b) => a.x0 - b.x0);

  const out: LocatedChain[] = [];
  const seen = new Set<string>();
  for (const chain of chainGlyphs(boxes)) {
    if (chain.length < 2) continue;
    // 連続する部分列（全体、先頭または末尾を 1〜2 個落としたもの）
    for (let len = Math.min(chain.length, 5); len >= Math.max(2, chain.length - 2); len--) {
      for (let start = 0; start + len <= chain.length; start++) {
        const sub = chain.slice(start, start + len);
        const key = sub.map((b) => `${b.x0},${b.y0}`).join(";");
        if (seen.has(key)) continue;
        seen.add(key);
        const prior = LENGTH_PRIOR[sub.length];
        if (!prior) continue;
        const score = prior * uniformity(sub) * DROP_PENALTY ** (chain.length - sub.length) * brightnessFactor(meanBrightness(rgba, mask, w, sub));
        out.push(toChain(sub, score));
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
