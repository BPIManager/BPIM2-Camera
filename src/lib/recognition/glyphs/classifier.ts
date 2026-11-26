import { GLYPH_H, GLYPH_W, type Glyph } from "./segment";

export interface GlyphTemplate {
  digit: number;
  vector: number[];
}

/** 学習済みモデル。見本の濃度ベクトルの集まり（最近傍法で判定する） */
export interface DigitModel {
  version: string;
  width: number;
  height: number;
  templates: GlyphTemplate[];
}

export interface DigitReading {
  digit: number;
  /** 0〜1。最近傍と次点の差から出す。1 に近いほど迷いがない */
  confidence: number;
  distance: number;
}

const dist = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
};

/** 距離がこの値を超える文字は数字として扱わない（装飾などの取り違え防止） */
export const MAX_DISTANCE = 0.32;

export function classifyGlyph(model: DigitModel, g: Glyph): DigitReading | null {
  if (model.width !== GLYPH_W || model.height !== GLYPH_H) return null;
  let best: { digit: number; d: number } | null = null;
  const perDigit = new Map<number, number>();
  for (const t of model.templates) {
    const d = dist(t.vector, g.vector);
    if (d < (perDigit.get(t.digit) ?? Infinity)) perDigit.set(t.digit, d);
  }
  for (const [digit, d] of perDigit) if (!best || d < best.d) best = { digit, d };
  if (!best || best.d > MAX_DISTANCE) return null;
  const runnerUp = Math.min(...[...perDigit.entries()].filter(([k]) => k !== best!.digit).map(([, d]) => d), Infinity);
  const confidence = runnerUp === Infinity ? 0.5 : Math.min(1, Math.max(0, (runnerUp - best.d) / Math.max(runnerUp, 1e-6)));
  return { digit: best.digit, confidence, distance: best.d };
}

export interface NumberReading {
  value: number;
  digits: DigitReading[];
  /** 全桁の確信度の最小値 */
  confidence: number;
}

/** 切り出した文字列を数値にする。1 文字でも数字と判定できなければ null */
export function readNumber(model: DigitModel, glyphs: readonly Glyph[]): NumberReading | null {
  if (glyphs.length === 0) return null;
  const digits: DigitReading[] = [];
  for (const g of glyphs) {
    const r = classifyGlyph(model, g);
    if (!r) return null;
    digits.push(r);
  }
  return {
    value: Number(digits.map((d) => d.digit).join("")),
    digits,
    confidence: Math.min(...digits.map((d) => d.confidence)),
  };
}
