import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";
import { parseJudgeNumbers } from "@/lib/recognition/paddle/parse";

// 正解のうち GR（目視）
const truth: Record<string, { pg: number; gr: number }> = {
  "20261126060215": { pg: 889, gr: 1 },
  "20261126060242": { pg: 1803, gr: 89 },
  "20261126060255": { pg: 1803, gr: 89 },
  "20261126060306": { pg: 1955, gr: 43 },
  "20261126060316": { pg: 1955, gr: 43 },
};
const variants: Record<string, (b: Buffer) => Promise<Buffer>> = {
  raw1200: (b) => sharp(b).resize({ width: 1200 }).png().toBuffer(),
  raw1600: (b) => sharp(b).resize({ width: 1600 }).png().toBuffer(),
  sharp1200: (b) => sharp(b).resize({ width: 1200 }).sharpen({ sigma: 1.5 }).normalize().png().toBuffer(),
  gray1200: (b) => sharp(b).resize({ width: 1200 }).grayscale().linear(1.6, -90).png().toBuffer(),
  inv1200: (b) => sharp(b).resize({ width: 1200 }).grayscale().normalize().negate().png().toBuffer(),
  blur1200: (b) => sharp(b).resize({ width: 1200 }).median(3).sharpen().png().toBuffer(),
};
it("judge preprocess", async () => {
  const engine = await createNodeEngine("small");
  const score: Record<string, number> = Object.fromEntries(Object.keys(variants).map((k) => [k, 0]));
  for (const [id, t] of Object.entries(truth)) {
    const src = readFileSync(`internal/captures/${id}_judge.jpg`);
    for (const [k, fn] of Object.entries(variants)) {
      const png = await fn(src);
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      const nums = parseJudgeNumbers(lines);
      const ok = nums.includes(t.pg) && nums.includes(t.gr);
      if (ok) score[k]++;
      console.log(id, k.padEnd(10), nums.join(","), ok ? "○" : "×");
    }
  }
  console.log("PGとGRが両方読めた件数:", JSON.stringify(score));
  await engine.destroy();
}, 600000);
