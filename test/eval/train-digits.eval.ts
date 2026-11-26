import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { classifyGlyph, type DigitModel } from "@/lib/recognition/glyphs/classifier";
import { colorMask, GLYPH_H, GLYPH_W, isCyan, segmentGlyphs, type Glyph } from "@/lib/recognition/glyphs/segment";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const OUT = process.env.MODEL_OUT ?? "public/models/digits.json";
const REPORT = process.env.TRAIN_REPORT ?? "train-report.txt";

interface Sample {
  image: string;
  digits: string;
  region: { x: number; y: number; width: number; height: number };
}

async function glyphsOf(s: Sample): Promise<Glyph[]> {
  const file = path.join(DIR, s.image);
  const meta = await sharp(file).metadata();
  const r = s.region;
  const region = {
    left: Math.round(r.x * meta.width!),
    top: Math.round(r.y * meta.height!),
    width: Math.min(Math.round(r.width * meta.width!), meta.width! - Math.round(r.x * meta.width!)),
    height: Math.round(r.height * meta.height!),
  };
  const { data, info } = await sharp(file).extract(region).resize({ height: 120 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return segmentGlyphs(colorMask(new Uint8ClampedArray(data), isCyan), info.width, info.height);
}

/** 正解ラベル付きサンプルから見本を作る。桁数が合わなかった画像は学習に使わず報告する */
describe("train digits", () => {
  it("見本を作ってモデルを書き出す", async () => {
    const manifest = JSON.parse(readFileSync("training/manifest.json", "utf8")) as { samples: Sample[] };
    const lines: string[] = [];
    const labeled: { digit: number; glyph: Glyph; from: string }[] = [];
    for (const s of manifest.samples) {
      const g = await glyphsOf(s);
      const ok = g.length === s.digits.length;
      lines.push(`${s.image} (${s.digits}): glyphs=${g.length} ${ok ? "採用" : "桁数不一致のため除外"}`);
      if (ok) g.forEach((glyph, i) => labeled.push({ digit: Number(s.digits[i]), glyph, from: s.image }));
    }

    // 同じ数字が複数画像にあるものだけ、他画像の見本で判定して精度を出す（leave-one-image-out）
    let tested = 0;
    let correct = 0;
    for (const item of labeled) {
      const others = labeled.filter((o) => o.from !== item.from);
      if (!others.some((o) => o.digit === item.digit)) continue;
      const model: DigitModel = { version: "loo", width: GLYPH_W, height: GLYPH_H, templates: others.map((o) => ({ digit: o.digit, vector: o.glyph.vector })) };
      tested++;
      if (classifyGlyph(model, item.glyph)?.digit === item.digit) correct++;
    }
    const covered = [...new Set(labeled.map((l) => l.digit))].sort();
    lines.push(`見本 ${labeled.length} 個 / 数字の網羅: ${covered.join(",")} / 未網羅: ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !covered.includes(d)).join(",") || "なし"}`);
    lines.push(`leave-one-image-out（他画像に同じ数字がある分のみ）: ${correct}/${tested}`);

    const model: DigitModel = {
      version: `trained-${labeled.length}`,
      width: GLYPH_W,
      height: GLYPH_H,
      templates: labeled.map((l) => ({ digit: l.digit, vector: l.glyph.vector.map((v) => Math.round(v * 1000) / 1000) })),
    };
    writeFileSync(OUT, JSON.stringify(model));
    writeFileSync(REPORT, lines.join("\n"));
  }, 120_000);
});
