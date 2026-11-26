import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { it } from "vitest";
import { digitRuns, scoreCandidates } from "@/lib/recognition/paddle/parse";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";
import { createNodeEngine } from "./paddleNode";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Label { image: string; digits?: string; boxes?: Box[]; size?: { w: number; h: number } }
const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });

type Variant = (rgba: Uint8ClampedArray) => Uint8ClampedArray;
const pred = (f: (r: number, g: number, b: number) => boolean): Variant => (p) => {
  const out = new Uint8ClampedArray(p.length);
  for (let i = 0; i < p.length; i += 4) {
    const v = f(p[i], p[i + 1], p[i + 2]) ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
};
const variants: Record<string, { width: number; fn: Variant | null }> = {
  raw400: { width: 400, fn: null },
  raw1100: { width: 1100, fn: null },
  cyan: { width: 700, fn: (p) => maskVariant(p, "cyan") },
  fill1: { width: 700, fn: pred((r, g, b) => g > 185 && b > 190 && r < g - 35) },
  fill2: { width: 700, fn: pred((r, g, b) => g > 170 && b > 180 && r < g - 25 && b - r > 50) },
  fill3: { width: 700, fn: pred((r, g, b) => g > 195 && b > 200 && r < g - 45 && b >= g - 10) },
};

async function run(engine: Awaited<ReturnType<typeof createNodeEngine>>, src: Buffer, v: { width: number; fn: Variant | null }): Promise<string[]> {
  let png: Buffer;
  if (!v.fn) png = await sharp(src).resize({ width: v.width }).png().toBuffer();
  else {
    const { data, info } = await sharp(src).resize({ width: v.width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = v.fn(new Uint8ClampedArray(data));
    png = await sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  }
  const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
  return digitRuns(lines.map((l) => l.text)).flatMap(scoreCandidates);
}

it("score color", async () => {
  const engine = await createNodeEngine("small");
  const tally: Record<string, [number, number]> = Object.fromEntries(Object.keys(variants).map((k) => [k, [0, 0]]));
  const report: string[] = [];
  const hits: Record<string, boolean[]> = Object.fromEntries(Object.keys(variants).map((k) => [k, []]));

  // (1) 実機で撮った保存画像（正解は目視）
  const truth: Record<string, string> = { "20261126060215": "1779", "20261126060242": "3695", "20261126060255": "3695", "20261126060306": "3953", "20261126060316": "3953" };
  const cap: Record<string, [number, number]> = Object.fromEntries(Object.keys(variants).map((k) => [k, [0, 0]]));
  for (const [id, ex] of Object.entries(truth)) {
    const src = readFileSync(`internal/captures/${id}_score.jpg`);
    for (const [k, v] of Object.entries(variants)) {
      const runs = await run(engine, src, v);
      cap[k][1]++;
      if (runs.includes(ex)) cap[k][0]++;
      hits[k].push(runs.includes(ex));
      report.push(`cap ${id} ${k.padEnd(8)} ${runs.join(",")} ${runs.includes(ex) ? "○" : "×"}`);
    }
  }
  // (2) 評価用画像（スコアの箱の周りを枠のつもりで切り出す）
  const labels = JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as Label[];
  for (const l of labels) {
    if (!l.digits || !l.boxes || !l.size) continue;
    const S = l.size;
    const b = union(l.boxes), h = b.y1 - b.y0;
    // 前回スコア（左隣）が入るように、左に広く取る
    const r = { x0: b.x0 - 5 * h, y0: b.y0 - 0.8 * h, x1: b.x1 + 1.5 * h, y1: b.y1 + 0.8 * h };
    const base = await sharp(path.join(DIR, l.image)).rotate().resize({ width: S.w, height: S.h, fit: "fill" }).png().toBuffer();
    const left = Math.min(S.w - 2, Math.max(0, Math.round(r.x0))), top = Math.min(S.h - 2, Math.max(0, Math.round(r.y0)));
    const crop = await sharp(base).extract({ left, top, width: Math.max(2, Math.min(S.w - left, Math.round(r.x1) - left)), height: Math.max(2, Math.min(S.h - top, Math.round(r.y1) - top)) }).png().toBuffer();
    for (const [k, v] of Object.entries(variants)) {
      const runs = await run(engine, crop, v);
      tally[k][1]++;
      if (runs.includes(l.digits)) tally[k][0]++;
      hits[k].push(runs.includes(l.digits));
    }
  }
  await engine.destroy();
  console.log(report.join("\n"));
  const anyHit = (...ks: string[]) => hits[ks[0]].map((_, i) => ks.some((k) => hits[k][i])).filter(Boolean).length;
  console.log("和集合（実機5＋評価36の計41件中）:", ["fill3", "fill3+raw400", "fill3+fill2", "fill3+fill2+raw400", "fill3+fill2+fill1+raw400"].map((c) => c + " " + anyHit(...c.split("+"))).join("  "));
  console.log("実機の保存画像:", Object.entries(cap).map(([k, [a, b]]) => `${k} ${a}/${b}`).join("  "));
  console.log("評価用画像（左に前回スコアが入る枠）:", Object.entries(tally).map(([k, [a, b]]) => `${k} ${a}/${b}`).join("  "));
}, 1800000);
