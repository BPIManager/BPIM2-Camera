import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { parseJudgeNumbers } from "@/lib/recognition/paddle/parse";
import { createNodeEngine } from "./paddleNode";

const truth: Record<string, [number, number]> = {
  "20261126060215": [889, 1], "20261126060242": [1803, 89], "20261126060255": [1803, 89], "20261126060306": [1955, 43], "20261126060316": [1955, 43],
  "20261126061944": [1566, 175], "20261126061917": [1552, 333], "20261126062237": [1874, 416],
};
const variants: Record<string, (b: Buffer) => Promise<Buffer>> = {
  raw1200: (b) => sharp(b).resize({ width: 1200 }).png().toBuffer(),
  raw1600: (b) => sharp(b).resize({ width: 1600 }).png().toBuffer(),
  gray900: (b) => sharp(b).resize({ width: 900 }).grayscale().normalize().png().toBuffer(),
  gray1200: (b) => sharp(b).resize({ width: 1200 }).grayscale().normalize().png().toBuffer(),
  gray1600: (b) => sharp(b).resize({ width: 1600 }).grayscale().normalize().png().toBuffer(),
};
it("judge gray", async () => {
  const engine = await createNodeEngine("small");
  const ok: Record<string, number> = Object.fromEntries(Object.keys(variants).map((k) => [k, 0]));
  const any: Record<string, boolean> = {};
  for (const [id, [pg, gr]] of Object.entries(truth)) {
    const src = readFileSync(`internal/captures/${id}_judge.jpg`);
    for (const [k, fn] of Object.entries(variants)) {
      const png = await fn(src);
      const nums = parseJudgeNumbers(await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer));
      const hit = nums.includes(pg) && nums.includes(gr);
      if (hit) { ok[k]++; any[id] = true; }
      console.log(id, k.padEnd(9), nums.join(","), hit ? "○" : "×");
    }
  }
  console.log("PGとGRが両方読めた件数（8件中）:", JSON.stringify(ok), "どれか1つでも読めた:", Object.keys(any).length);
  await engine.destroy();
}, 600000);
