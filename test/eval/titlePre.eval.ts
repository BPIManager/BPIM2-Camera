import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";
import { maskVariant, type Variant } from "@/lib/recognition/ocr/preprocess";

const masked = (variant: Variant, width: number) => async (b: Buffer) => {
  const { data, info } = await sharp(b).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return sharp(Buffer.from(maskVariant(new Uint8ClampedArray(data), variant)), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
};
const variants: Record<string, (b: Buffer) => Promise<Buffer>> = {
  raw900: (b) => sharp(b).resize({ width: 900 }).png().toBuffer(),
  raw1400: (b) => sharp(b).resize({ width: 1400 }).png().toBuffer(),
  gray: (b) => sharp(b).resize({ width: 1200 }).grayscale().normalize().png().toBuffer(),
  sharpen: (b) => sharp(b).resize({ width: 1200 }).sharpen({ sigma: 2 }).png().toBuffer(),
  contrast: masked("contrast", 1200),
  bright: masked("bright", 1200),
  white: masked("white", 1200),
};
it("title preprocess", async () => {
  const engine = await createNodeEngine("small");
  const ids = ["20261126062237", "20261126061944", "20261126061917", "20261126060242"];
  const stat: Record<string, number> = Object.fromEntries(Object.keys(variants).map((k) => [k, 0]));
  for (const id of ids) {
    const src = readFileSync(`internal/captures/${id}_title.jpg`);
    for (const [k, fn] of Object.entries(variants)) {
      const png = await fn(src);
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      const text = lines.map((l) => `${l.text}(${Math.round(l.confidence)})`).join(" | ");
      if (/\d{4}/.test(text)) stat[k]++;
      console.log(id, k.padEnd(9), text);
    }
  }
  console.log("4桁（ノーツ数）が読めた件数:", JSON.stringify(stat));
  await engine.destroy();
}, 600000);
