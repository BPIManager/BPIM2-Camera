/** 切り出した 1 文字。0〜1 の濃度ベクトル（GLYPH_W × GLYPH_H） */
export interface Glyph {
  x: number;
  y: number;
  width: number;
  height: number;
  vector: number[];
}

export const GLYPH_W = 28;
export const GLYPH_H = 18;

/** 水色（今回スコアの数字）の画素か。HSV で見て照明の違いに強くする */
export function isCyan(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 130) return false;
  const sat = (max - min) / max;
  if (sat < 0.35) return false;
  if (max !== b && max !== g) return false;
  const d = max - min;
  const hue = max === g ? 60 * (2 + (b - r) / d) : 60 * (4 + (r - g) / d);
  return hue >= 160 && hue <= 215;
}

export function colorMask(rgba: Uint8ClampedArray, pred: (r: number, g: number, b: number) => boolean): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = pred(rgba[p], rgba[p + 1], rgba[p + 2]) ? 1 : 0;
  return out;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
}

/**
 * 横方向にほぼ重なる成分を 1 つにまとめる。掠れや隙間で上下にちぎれた 1 文字を戻すためのもので、
 * 隣の桁（斜体で少し重なる程度）はまとめない。
 */
export function mergeFragments(boxes: Box[]): Box[] {
  const list = boxes.map((b) => ({ ...b }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
        const narrower = Math.min(a.x1 - a.x0 + 1, b.x1 - b.x0 + 1);
        const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) - 1;
        const shorter = Math.min(a.y1 - a.y0 + 1, b.y1 - b.y0 + 1);
        // 縦に離れた別物（枠の飾りなど）は統合しない
        if (overlap >= narrower * 0.6 && gapY <= Math.max(3, shorter * 0.25)) {
          list[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area };
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return list;
}

/** 8 近傍の連結成分。外接矩形と画素数を返す */
export function components(mask: Uint8Array, w: number, h: number): Box[] {
  const seen = new Uint8Array(mask.length);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const box: Box = { x0: w, y0: h, x1: 0, y1: 0, area: 0 };
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      box.area++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    boxes.push(box);
  }
  return boxes;
}

/**
 * 外接矩形内の画素を、縦横比を保ったまま高さ GLYPH_H に合わせて縮小し、GLYPH_W × GLYPH_H の濃度ベクトルにする。
 * 幅は伸ばさず中央に置く（細い「1」が太い数字に似ないようにするため）。矩形の外の画素は数えない。
 */
export function normalizeGlyph(mask: Uint8Array, w: number, b: Pick<Box, "x0" | "y0" | "x1" | "y1">): number[] {
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const scale = bh / GLYPH_H;
  // 幅が収まらないほど横長のときは、横に収まる縮尺にする
  const s = Math.max(scale, bw / GLYPH_W);
  const left = b.x0 + bw / 2 - (GLYPH_W * s) / 2;
  const top = b.y0 + bh / 2 - (GLYPH_H * s) / 2;
  const v: number[] = [];
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      const sx0 = left + gx * s;
      const sy0 = top + gy * s;
      const x0 = Math.floor(sx0);
      const x1 = Math.max(x0 + 1, Math.ceil(sx0 + s));
      const y0 = Math.floor(sy0);
      const y1 = Math.max(y0 + 1, Math.ceil(sy0 + s));
      let on = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          n++;
          if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) on += mask[y * w + x];
        }
      }
      v.push(n ? on / n : 0);
    }
  }
  return v;
}

/** 隣り合い、高さが揃い、少しずつ上下にずれてもよい成分の連鎖のうち最長のものを返す */
export function longestChain(boxes: Box[]): Box[] {
  return chainGlyphs(boxes)[0] ?? [];
}

/**
 * x 順の成分から連鎖（数字列の候補）を作る。終端ごとに最長の連鎖を 1 本ずつ返し、長い順に並べる。
 * 撮影の傾きで行が斜めでも追える。
 */
export function chainGlyphs(boxes: Box[]): Box[][] {
  if (boxes.length === 0) return [];
  const sorted = [...boxes].sort((p, q) => p.x0 - q.x0);
  const cy = (b: Box) => (b.y0 + b.y1) / 2;
  const ht = (b: Box) => b.y1 - b.y0 + 1;
  const next = (p: Box, q: Box) =>
    q.x0 > p.x0 &&
    q.x0 - p.x1 <= ht(p) &&
    Math.abs(cy(q) - cy(p)) <= ht(p) * 0.5 &&
    ht(q) >= ht(p) * 0.7 &&
    ht(q) <= ht(p) * 1.4;
  const len = sorted.map(() => 1);
  const from = sorted.map(() => -1);
  for (let j = 0; j < sorted.length; j++) {
    for (let i = 0; i < j; i++) {
      if (next(sorted[i], sorted[j]) && len[i] + 1 > len[j]) {
        len[j] = len[i] + 1;
        from[j] = i;
      }
    }
  }
  const chains = sorted.map((_, end) => {
    const c: Box[] = [];
    for (let k = end; k >= 0; k = from[k]) c.unshift(sorted[k]);
    return c;
  });
  // 他の連鎖に完全に含まれるものは除く
  return chains
    .filter((c, i) => !chains.some((o, j) => j !== i && o.length > c.length && c.every((b) => o.includes(b))))
    .sort((p, q) => q.length - p.length || q.reduce((a, b) => a + b.area, 0) - p.reduce((a, b) => a + b.area, 0));
}

/** 数字 1 文字の標準的な縦横比（幅 / 高さ）。斜体と撮影の傾きで横長になる */
const GLYPH_ASPECT = 1.4;

/**
 * 接触した複数の文字が 1 つの成分になっているとき、列ごとの画素数が最小の位置（谷）で分割する。
 * 幅が標準の 1.6 倍以上のときだけ働く。
 */
export function splitWide(mask: Uint8Array, w: number, box: Box): Box[] {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const n = Math.round(bw / bh / GLYPH_ASPECT);
  if (bw / bh < GLYPH_ASPECT * 1.6 || n < 2) return [box];

  return splitInto(mask, w, box, n);
}

/**
 * 外接矩形を n 個の文字に分ける。各境界は、等分位置の近くで列ごとの画素数が最小の位置（谷）にする。
 * 接触した文字を、桁数が分かっているときに切り分けるために使う。
 */
export function splitInto(mask: Uint8Array, w: number, box: Box, n: number): Box[] {
  const bw = box.x1 - box.x0 + 1;
  if (n < 2) return [box];
  const col = (x: number) => {
    let c = 0;
    for (let y = box.y0; y <= box.y1; y++) c += mask[y * w + x];
    return c;
  };
  const cuts: number[] = [];
  const step = bw / n;
  for (let k = 1; k < n; k++) {
    const center = box.x0 + Math.round(k * step);
    const lo = Math.max(box.x0 + 1, Math.round(center - step * 0.2));
    const hi = Math.min(box.x1 - 1, Math.round(center + step * 0.2));
    let best = center;
    let bestC = Infinity;
    for (let x = lo; x <= hi; x++) {
      const c = col(x);
      if (c < bestC) (bestC = c), (best = x);
    }
    cuts.push(best);
  }
  const edges = [box.x0, ...cuts, box.x1 + 1];
  const out: Box[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = edges[i];
    const x1 = edges[i + 1] - 1;
    let y0 = box.y1;
    let y1 = box.y0;
    let area = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (mask[y * w + x]) (area++, (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y)));
      }
    }
    if (area > 0) out.push({ x0, y0, x1, y1, area });
  }
  return out;
}

/**
 * マスクから数字列を切り出して左から順に返す。
 * 小さいノイズを除いたうえで、「隣り合い、高さが揃い、少しずつ上下にずれてもよい成分」の
 * 最も長い連鎖を数字列とみなす（撮影の傾きで行が斜めになっても追える。飾りや差分表示は連鎖から外れる）。
 */
export function segmentGlyphs(mask: Uint8Array, w: number, h: number): Glyph[] {
  const boxes = mergeFragments(components(mask, w, h))
    .flatMap((b) => splitWide(mask, w, b))
    .filter((b) => {
      const bh = b.y1 - b.y0 + 1;
      const bw = b.x1 - b.x0 + 1;
      return bh >= h * 0.15 && bw / bh <= 1.8 && b.area >= 12;
    })
    .sort((a, b) => a.x0 - b.x0);
  if (boxes.length === 0) return [];

  const chain = longestChain(boxes);

  return chain.map((b) => ({
    x: b.x0,
    y: b.y0,
    width: b.x1 - b.x0 + 1,
    height: b.y1 - b.y0 + 1,
    vector: normalizeGlyph(mask, w, b),
  }));
}
