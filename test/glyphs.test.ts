import { describe, expect, it } from "vitest";
import { classifyGlyph, readNumber, type DigitModel } from "@/lib/recognition/glyphs/classifier";
import { GLYPH_H, GLYPH_W, isCyan, isWhite, normalizeGlyph, segmentGlyphs } from "@/lib/recognition/glyphs/segment";

/** テスト用の 5×7 ドット数字（実機のフォントではない。分割・判定の仕組みの検証用） */
const FONT: Record<number, string[]> = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

const SCALE = 6;
const GAP = 10;

/** 数字列をマスク画像に描く。skew で斜体風に傾ける */
function render(text: string, skew = 0): { mask: Uint8Array; w: number; h: number } {
  const cell = 5 * SCALE;
  const w = text.length * (cell + GAP) + 20;
  const h = 7 * SCALE + 10;
  const mask = new Uint8Array(w * h);
  [...text].forEach((ch, i) => {
    FONT[Number(ch)].forEach((row, ry) => {
      [...row].forEach((on, rx) => {
        if (on !== "1") return;
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const y = 5 + ry * SCALE + dy;
            const x = 10 + i * (cell + GAP) + rx * SCALE + dx + Math.round(skew * (h - y));
            if (x >= 0 && x < w) mask[y * w + x] = 1;
          }
        }
      });
    });
  });
  return { mask, w, h };
}

/** 学習では傾き違いの見本も作る（斜体フォントや斜めの撮影に備えた水増し） */
function modelFrom(digits: number[]): DigitModel {
  const skews = [-0.06, 0, 0.06];
  return {
    version: "test",
    width: GLYPH_W,
    height: GLYPH_H,
    templates: digits.flatMap((digit) =>
      skews.map((sk) => {
        const { mask, w, h } = render(String(digit), sk);
        return { digit, vector: segmentGlyphs(mask, w, h)[0].vector };
      }),
    ),
  };
}

const model = modelFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

describe("segmentGlyphs", () => {
  it("数字列を桁ごとに左から切り出す", () => {
    const { mask, w, h } = render("3365");
    const g = segmentGlyphs(mask, w, h);
    expect(g).toHaveLength(4);
    expect(g.map((x) => x.x)).toEqual([...g.map((x) => x.x)].sort((a, b) => a - b));
  });

  it("極端に小さい成分（ノイズ）は無視する", () => {
    const { mask, w, h } = render("12");
    mask[2 * w + 2] = 1;
    expect(segmentGlyphs(mask, w, h)).toHaveLength(2);
  });
});

describe("readNumber", () => {
  it("切り出した桁を分類して数値にする", () => {
    for (const s of ["3365", "3304", "1796", "2048"]) {
      const { mask, w, h } = render(s);
      expect(readNumber(model, segmentGlyphs(mask, w, h))?.value).toBe(Number(s));
    }
  });

  it("多少傾いても読める", () => {
    const { mask, w, h } = render("3451", 0.05);
    expect(readNumber(model, segmentGlyphs(mask, w, h))?.value).toBe(3451);
  });

  it("見本と大きく違う形は数字として扱わない（装飾の取り違え防止）", () => {
    const w = 40;
    const h = 60;
    const mask = new Uint8Array(w * h);
    for (let y = 5; y < 55; y++) for (let x = 10; x < 30; x++) mask[y * w + x] = 1;
    const g = segmentGlyphs(mask, w, h);
    expect(readNumber({ ...model, templates: model.templates.filter((t) => t.digit === 0) }, g)).toBeNull();
  });

  it("モデルの寸法が違えば使わない", () => {
    const { mask, w, h } = render("1");
    expect(classifyGlyph({ ...model, width: 8 }, segmentGlyphs(mask, w, h)[0])).toBeNull();
  });
});

describe("色マスク / 正規化", () => {
  it("水色は数字、白・赤は対象外", () => {
    expect(isCyan(20, 200, 240)).toBe(true);
    expect(isCyan(250, 250, 250)).toBe(false);
    expect(isCyan(240, 40, 40)).toBe(false);
  });

  it("白は明るく色味が薄い画素だけ（水色・暗い灰色・赤は対象外）", () => {
    expect(isWhite(240, 240, 235)).toBe(true);
    expect(isWhite(20, 200, 240)).toBe(false);
    expect(isWhite(90, 90, 90)).toBe(false);
    expect(isWhite(240, 60, 60)).toBe(false);
  });

  it("正規化ベクトルの長さは GLYPH_W × GLYPH_H", () => {
    const m = new Uint8Array(100).fill(1);
    expect(normalizeGlyph(m, 10, { x0: 0, y0: 0, x1: 9, y1: 9 })).toHaveLength(GLYPH_W * GLYPH_H);
  });
});

describe("readScoreByGlyphs", () => {
  it("見本が 10 桁そろったモデルは coverage 10、欠けていれば小さい", async () => {
    const { modelCoverage } = await import("@/lib/recognition/glyphs/readScore");
    expect(modelCoverage(model)).toBe(10);
    expect(modelCoverage({ ...model, templates: model.templates.filter((t) => t.digit < 3) })).toBe(3);
  });

  it("水色の数字画像から数値を読む。桁数が 5 以上（飾りを拾った）なら読めなかったことにする", async () => {
    const { readScoreByGlyphs } = await import("@/lib/recognition/glyphs/readScore");
    const paint = (text: string) => {
      const { mask, w, h } = render(text);
      const data = new Uint8ClampedArray(w * h * 4);
      mask.forEach((v, i) => {
        data.set(v ? [20, 200, 240, 255] : [0, 0, 0, 255], i * 4);
      });
      return { data, width: w, height: h };
    };
    expect(readScoreByGlyphs(paint("3365"), model)?.value).toBe(3365);
    expect(readScoreByGlyphs(paint("12345"), model)).toBeNull();
  });
});

describe("splitInto", () => {
  it("接触した 2 文字を、桁数を指定して谷で切り分ける", async () => {
    const { splitInto, components } = await import("@/lib/recognition/glyphs/segment");
    // 幅 10 の縦棒 2 本を細い橋（1 行）でつないだ形
    const w = 40;
    const h = 20;
    const mask = new Uint8Array(w * h);
    for (let y = 2; y < 18; y++) for (let x = 5; x < 15; x++) mask[y * w + x] = 1;
    for (let y = 2; y < 18; y++) for (let x = 20; x < 30; x++) mask[y * w + x] = 1;
    for (let x = 15; x < 20; x++) mask[10 * w + x] = 1;
    const [whole] = components(mask, w, h);
    expect(components(mask, w, h)).toHaveLength(1);
    const parts = splitInto(mask, w, whole, 2);
    expect(parts).toHaveLength(2);
    expect(parts[0].x1).toBeLessThan(parts[1].x0);
    expect(parts[0].x0).toBe(5);
    expect(parts[1].x1).toBe(29);
  });

  it("n が 1 なら分割しない", async () => {
    const { splitInto } = await import("@/lib/recognition/glyphs/segment");
    const box = { x0: 0, y0: 0, x1: 9, y1: 9, area: 50 };
    expect(splitInto(new Uint8Array(100), 10, box, 1)).toEqual([box]);
  });
});
