import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { readNumber, type DigitModel } from "@/lib/recognition/glyphs/classifier";
import { locateScoreChains } from "@/lib/recognition/glyphs/locate";
import { colorMask, isCyan, segmentGlyphs } from "@/lib/recognition/glyphs/segment";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const OUT = process.env.EVAL_OUT_DIR ?? ".";
const model = JSON.parse(readFileSync("public/models/digits.json", "utf8")) as DigitModel;

describe("locate", () => {
  it("全画像でスコアの数字列を探して読む", async () => {
    const files = readdirSync(DIR).filter((f) => /\.(jpg|webp)$/i.test(f));
    const lines: string[] = [];
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    const TW = 360, TH = 110;
    let found = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const file = path.join(DIR, f);
      const { data, info } = await sharp(file).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const rgba = new Uint8ClampedArray(data);
      const chains = locateScoreChains(rgba, info.width, info.height);
      const top = chains[0];
      let label = "なし";
      let crop: Buffer;
      if (top) {
        found++;
        const m = Math.round(top.box.height * 0.6);
        const region = { left: Math.max(0, top.box.x - m), top: Math.max(0, top.box.y - m), width: Math.min(info.width, top.box.width + m * 2), height: Math.min(info.height, top.box.height + m * 2) };
        region.width = Math.min(region.width, info.width - region.left);
        region.height = Math.min(region.height, info.height - region.top);
        const raw = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract(region).resize({ height: 120 }).raw().toBuffer({ resolveWithObject: true });
        const g = segmentGlyphs(colorMask(new Uint8ClampedArray(raw.data), isCyan), raw.info.width, raw.info.height);
        const r = g.length ? readNumber(model, g) : null;
        label = `${top.boxes.length}桁 読み=${r?.value ?? "?"} y=${Math.round((top.box.y / info.height) * 100)}% x=${Math.round((top.box.x / info.width) * 100)}%`;
        crop = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract(region).resize(TW, TH - 22, { fit: "contain", background: "#000" }).jpeg().toBuffer();
      } else {
        crop = await sharp({ create: { width: TW, height: TH - 22, channels: 3, background: "#300" } }).jpeg().toBuffer();
      }
      lines.push(`${i} ${f}: ${label}`);
      const svg = Buffer.from(`<svg width="${TW}" height="22"><rect width="100%" height="100%" fill="#000"/><text x="4" y="16" font-size="13" fill="#fff">${i} ${label}</text></svg>`);
      const tile = await sharp(crop).extend({ bottom: 22, background: "#000" }).composite([{ input: svg, gravity: "south" }]).toBuffer();
      tiles.push({ input: tile, left: (i % 4) * TW, top: Math.floor(i / 4) * TH });
    }
    lines.push(`見つかった: ${found}/${files.length}`);
    await sharp({ create: { width: 4 * TW, height: Math.ceil(files.length / 4) * TH, channels: 3, background: "#111" } }).composite(tiles).jpeg({ quality: 85 }).toFile(path.join(OUT, "locate-sheet.jpg"));
    writeFileSync(path.join(OUT, "locate.txt"), lines.join("\n"));
  }, 600_000);
});
