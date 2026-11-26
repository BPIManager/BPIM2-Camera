import { chainGlyphs, colorMask, isCyan, splitWide, components, mergeFragments, type Box } from "./segment";

export interface LocatedChain {
  /** 画像上の外接矩形 */
  box: { x: number; y: number; width: number; height: number };
  boxes: Box[];
  /** 高さの揃い具合など。大きいほど数字列らしい */
  score: number;
}

/** 数字の高さが画像の高さに占める割合の許容範囲（飾り・大きな文字・ノイズを除く） */
const MIN_REL_HEIGHT = 0.012;
const MAX_REL_HEIGHT = 0.07;

/**
 * 枠に頼らず、画像全体から今回スコアの水色の数字列を探す。
 * 水色の成分を桁として連鎖させ、桁数 2〜5・高さが揃ったものから最も数字列らしいものを返す。
 * 見つからなければ null。
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

  const chains = chainGlyphs(boxes);
  return chains
    .filter((c) => c.length >= 2 && c.length <= 5)
    .map((c) => {
      const hs = c.map((b) => b.y1 - b.y0 + 1);
      const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
      const spread = Math.max(...hs.map((x) => Math.abs(x - mean))) / mean;
      const x0 = Math.min(...c.map((b) => b.x0));
      const y0 = Math.min(...c.map((b) => b.y0));
      const x1 = Math.max(...c.map((b) => b.x1));
      const y1 = Math.max(...c.map((b) => b.y1));
      // 3〜4 桁を最も数字列らしいとし、高さが揃っているほど高く評価する
      const lenScore = c.length >= 3 && c.length <= 4 ? 1 : 0.5;
      return { box: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }, boxes: c, score: lenScore * (1 - Math.min(1, spread)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
