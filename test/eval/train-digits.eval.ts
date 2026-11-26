import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { classifyGlyph, type DigitModel } from "@/lib/recognition/glyphs/classifier";
import { locateScoreChains } from "@/lib/recognition/glyphs/locate";
import { colorMask, GLYPH_H, GLYPH_W, isCyan, normalizeGlyph, type Glyph } from "@/lib/recognition/glyphs/segment";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const OUT = process.env.MODEL_OUT ?? "public/models/digits.json";
const REPORT = process.env.TRAIN_REPORT ?? "train-report.txt";

interface Sample {
  image: string;
  digits: string;
  hint: { x: number; y: number };
}

/** 画像全体から数字列を探し、ヒント位置に最も近い候補の桁を切り出す。桁数が合わなければ null */
async function glyphsOf(s: Sample): Promise<Glyph[] | null> {
  const { data, info } = await sharp(path.join(DIR, s.image)).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data);
  const chains = locateScoreChains(rgba, info.width, info.height, 12).filter((c) => c.boxes.length === s.digits.length);
  if (chains.length === 0) return null;
  const hx = (s.hint.x / 100) * info.width;
  const hy = (s.hint.y / 100) * info.height;
  chains.sort((a, b) => Math.hypot(a.box.x - hx, a.box.y - hy) - Math.hypot(b.box.x - hx, b.box.y - hy));
  const best = chains[0];
  if (Math.hypot(best.box.x - hx, best.box.y - hy) > info.width * 0.08) return null;
  const mask = colorMask(rgba, isCyan);
  return best.boxes.map((b) => ({ x: b.x0, y: b.y0, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1, vector: normalizeGlyph(mask, info.width, b) }));
}

describe("train digits", () => {
  it("見本を作ってモデルを書き出す", async () => {
    const manifest = JSON.parse(readFileSync("training/manifest.json", "utf8")) as { samples: Sample[] };
    const lines: string[] = [];
    const labeled: { digit: number; glyph: Glyph; from: string }[] = [];
    for (const s of manifest.samples) {
      const g = await glyphsOf(s);
      lines.push(`${s.image} (${s.digits}): ${g ? "採用" : "検出できず除外"}`);
      if (g) g.forEach((glyph, i) => labeled.push({ digit: Number(s.digits[i]), glyph, from: s.image }));
    }

    // leave-one-image-out: その画像の見本を除いたモデルで、その画像の桁を判定する
    const perDigit = new Map<number, { ok: number; n: number }>();
    let ok = 0;
    let rejected = 0;
    for (const item of labeled) {
      const others = labeled.filter((o) => o.from !== item.from);
      const model: DigitModel = { version: "loo", width: GLYPH_W, height: GLYPH_H, templates: others.map((o) => ({ digit: o.digit, vector: o.glyph.vector })) };
      const r = classifyGlyph(model, item.glyph);
      const stat = perDigit.get(item.digit) ?? { ok: 0, n: 0 };
      stat.n++;
      if (r?.digit === item.digit) (stat.ok++, ok++);
      if (r === null) rejected++;
      perDigit.set(item.digit, stat);
    }
    const covered = [...new Set(labeled.map((l) => l.digit))].sort();
    lines.push(`画像 ${new Set(labeled.map((l) => l.from)).size} 枚 / 見本 ${labeled.length} 個 / 網羅: ${covered.join(",")}`);
    lines.push(`leave-one-image-out 桁正解率: ${ok}/${labeled.length} (${((ok / labeled.length) * 100).toFixed(1)}%) うち距離超過で棄却 ${rejected}`);
    lines.push(`数字別: ${[...perDigit.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => `${d}:${v.ok}/${v.n}`).join(" ")}`);

    const model: DigitModel = {
      version: `trained-${labeled.length}`,
      width: GLYPH_W,
      height: GLYPH_H,
      templates: labeled.map((l) => ({ digit: l.digit, vector: l.glyph.vector.map((v) => Math.round(v * 1000) / 1000) })),
    };
    writeFileSync(OUT, JSON.stringify(model));
    writeFileSync(REPORT, lines.join("\n"));
  }, 300_000);
});
