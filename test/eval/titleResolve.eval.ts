import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";
import { rawFromPaddle } from "@/lib/recognition/paddle/fromPaddle";
import { resolveResult } from "@/lib/recognition/resolve";
import { toGray } from "@/lib/vision/frame";
import { estimateTilt } from "@/lib/vision/deskew";
import type { OcrLine } from "@/lib/recognition/paddle/engine";

const MIN_ANGLE = Number(process.env.MIN_ANGLE ?? 1.5);

/** アプリと同じ流れ（gray → 決まらなければ raw900 を足す）で、曲が決まるかを、傾き補正の有無で比べる */
it("title resolve (deskew)", async () => {
  const master = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const engine = await createNodeEngine("small");
  writeFileSync("internal/title-resolve.txt", "");
  const readGray = async (b: Buffer) => {
    const { data, info } = await sharp(b).resize({ width: 1200 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const m = maskVariant(new Uint8ClampedArray(data), "gray");
    const png = await sharp(Buffer.from(m), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    return engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  };
  const readRaw = async (b: Buffer) => {
    const png = await sharp(b).resize({ width: 900 }).png().toBuffer();
    return engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  };
  const resolve = (lines: OcrLine[]) => {
    const r = rawFromPaddle({ title: lines, score: [], judge: [] }, master);
    return { r, chart: r ? resolveResult(r, master).chart : null };
  };
  /** アプリと同じ: gray で決まれば終わり、決まらなければ raw900 を足す */
  const flow = async (b: Buffer) => {
    const gray = await readGray(b);
    let res = resolve(gray);
    if (!res.chart) res = resolve([...gray, ...(await readRaw(b))]);
    return res;
  };
  const tally = { base: 0, deskew: 0, n: 0, fixed: 0, broke: 0 };
  for (const f of (process.env.FILES ?? "").split(",").filter(Boolean)) {
    const src = readFileSync(f);
    const { data, info } = await sharp(src).resize({ width: 320 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const tilt = estimateTilt(toGray(new Uint8ClampedArray(data), info.width, info.height));
    const apply = Math.abs(tilt.angle) >= MIN_ANGLE;
    const rotated = apply ? await sharp(src).rotate(tilt.angle, { background: "#000" }).jpeg({ quality: 92 }).toBuffer() : src;
    const a = await flow(src);
    const b = apply ? await flow(rotated) : a;
    tally.n++;
    if (a.chart) tally.base++;
    if (b.chart) tally.deskew++;
    if (!a.chart && b.chart) tally.fixed++;
    if (a.chart && !b.chart) tally.broke++;
    const name = f.split(/[\/]/).pop()!;
    appendFileSync("internal/title-resolve.txt", `${name.padEnd(28)} angle=${tilt.angle.toFixed(2).padStart(6)} ${apply ? "補正" : "なし"} 補正前=${a.chart ? a.chart.title : "未確定"} 補正後=${b.chart ? b.chart.title : "未確定"}\n`);
  }
  appendFileSync("internal/title-resolve.txt", `\n${JSON.stringify(tally)}\n`);
  await engine.destroy();
}, 1800000);
