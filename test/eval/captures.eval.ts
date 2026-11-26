import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";

const DIR = "internal/captures";

/** 前処理ごとに、保存された判定の切り出しを読んで比べる */
it("captures: judge", async () => {
  const engine = await createNodeEngine("small");
  const files = readdirSync(DIR).filter((f) => f.endsWith("_judge.jpg"));
  const variants: Record<string, (b: Buffer) => Promise<Buffer>> = {
    "raw700": (b) => sharp(b).resize({ width: 700 }).png().toBuffer(),
    "raw1200": (b) => sharp(b).resize({ width: 1200 }).png().toBuffer(),
    "gray-norm": (b) => sharp(b).resize({ width: 900 }).grayscale().normalize().png().toBuffer(),
    "white-mask": async (b) => {
      const { data, info } = await sharp(b).resize({ width: 900 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const out = Buffer.alloc(info.width * info.height);
      for (let i = 0; i < out.length; i++) out[i] = Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) > 170 ? 0 : 255;
      return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
    },
  };
  for (const f of files) {
    const src = readFileSync(path.join(DIR, f));
    console.log("==", f);
    for (const [name, fn] of Object.entries(variants)) {
      const png = await fn(src);
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      console.log(`  ${name.padEnd(10)} ${lines.map((l) => `${l.text}(${Math.round(l.confidence)})`).join(" | ")}`);
    }
  }
  await engine.destroy();
}, 600000);

import { maskVariant } from "@/lib/recognition/ocr/preprocess";
import { rawFromPaddle } from "@/lib/recognition/paddle/fromPaddle";

/** 実機で撮った保存画像から、確定まで通しで確かめる（正解は目視） */
it("captures: end to end", async () => {
  const master = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const truth: Record<string, number> = { "20261126060215": 1779, "20261126060242": 3695, "20261126060255": 3695, "20261126060306": 3953, "20261126060316": 3953, "20261126061944": 3307, "20261126061917": 3437, "20261126062237": 4164 };
  const engine = await createNodeEngine("small");
  const read = async (file: string, width: number, mask: "cyanFill" | "cyanFillLoose" | "gray" | null = null) => {
    let png: Buffer;
    if (!mask) png = await sharp(readFileSync(path.join(DIR, file))).resize({ width }).png().toBuffer();
    else {
      const { data, info } = await sharp(readFileSync(path.join(DIR, file))).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      png = await sharp(Buffer.from(maskVariant(new Uint8ClampedArray(data), mask)), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    }
    return engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  };
  for (const [id, ex] of Object.entries(truth)) {
    const rd = { title: [...(await read(id + "_title.jpg", 1200, "gray")), ...(await read(id + "_title.jpg", 900))], score: [await read(id + "_score.jpg", 700, "cyanFill"), await read(id + "_score.jpg", 700, "cyanFillLoose"), await read(id + "_score.jpg", 400)], judge: [await read(id + "_judge.jpg", 700), await read(id + "_judge.jpg", 1200), await read(id + "_judge.jpg", 1600)] };
    const fmt = (ls: { text: string; confidence: number }[]) => ls.map((l) => l.text + "(" + Math.round(l.confidence) + ")").join(" | ");
    console.log("  title:", fmt(rd.title));
    console.log("  score:", rd.score.map(fmt).join(" // "));
    console.log("  judge:", rd.judge.map(fmt).join(" // "));
    const raw = rawFromPaddle({ ...rd, scoreGroups: ["color", "color", "raw"] }, master);
    console.log(id, "正解", ex, "→", raw?.exScore.value, raw?.titleText, raw?.notes, raw?.difficulty, raw?.level, raw?.exScore.value === ex ? "○" : raw?.exScore.value == null ? "未確定" : "×誤り");
  }
  await engine.destroy();
}, 600000);
