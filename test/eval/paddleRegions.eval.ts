import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { digitRuns, parseJudgeRows, parseRankGap, scoreCandidates } from "@/lib/recognition/paddle/parse";
import { createNodeEngine } from "./paddleNode";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const MODEL = (process.env.PADDLE_MODEL ?? "small") as "tiny" | "small" | "medium";

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Field { digits: string; boxes?: Box[]; size?: { w: number; h: number }; rank?: string; sign?: string }
interface Label { image: string; digits?: string; boxes?: Box[]; size?: { w: number; h: number }; fields?: { pg?: Field; gr?: Field; gap?: Field } }

const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });

/** ラベルの箱の周りを、撮影枠のつもりで余白付きで切り出す */
async function crop(file: string, size: { w: number; h: number }, r: Box, width = Number(process.env.CROP_WIDTH ?? 700)) {
  const base = sharp(await sharp(file).rotate().resize({ width: size.w, height: size.h, fit: "fill" }).png().toBuffer());
  const left = Math.min(size.w - 2, Math.max(0, Math.round(r.x0))), top = Math.min(size.h - 2, Math.max(0, Math.round(r.y0)));
  const w = Math.max(2, Math.min(size.w - left, Math.round(r.x1) - left)), h = Math.max(2, Math.min(size.h - top, Math.round(r.y1) - top));
  const png = await base.extract({ left, top, width: w, height: h }).resize({ width }).png().toBuffer();
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}

describe("paddle (枠で切り出し)", () => {
  it("スコア・PG・GR・ランク差分を読む", async () => {
    const labels = JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as Label[];
    const engine = await createNodeEngine(MODEL);
    const out: string[] = [];
    const tally = { score: [0, 0], pg: [0, 0], gr: [0, 0], gap: [0, 0] };
    const bump = (k: keyof typeof tally, ok: boolean) => { tally[k][1]++; if (ok) tally[k][0]++; };
    for (const l of labels) {
      const file = path.join(DIR, l.image);
      const line: string[] = [l.image];
      if (l.digits && l.boxes && l.size) {
        const b = union(l.boxes), h = b.y1 - b.y0;
        const lines = await engine.readLines(await crop(file, l.size, { x0: b.x0 - 1.5 * h, y0: b.y0 - 0.8 * h, x1: b.x1 + 1.5 * h, y1: b.y1 + 0.8 * h }));
        const runs = digitRuns(lines.map((x) => x.text)).flatMap(scoreCandidates);
        const ok = runs.includes(l.digits);
        bump("score", ok);
        line.push(`score ${l.digits} ${ok ? "○" : "×"} [${lines.map((x) => x.text).join(" | ")}]`);
      }
      const f = l.fields;
      if (f?.pg?.boxes && f.pg.size) {
        const p = union(f.pg.boxes), g = f.gr?.boxes ? union(f.gr.boxes) : p, h = p.y1 - p.y0;
        const lines = await engine.readLines(await crop(file, f.pg.size, { x0: p.x0 - 8 * h, y0: p.y0 - 0.6 * h, x1: p.x1 + h, y1: g.y1 + 4.5 * h }));
        const j = parseJudgeRows(lines);
        if (f.pg) bump("pg", String(j.pg) === f.pg.digits);
        if (f.gr) bump("gr", String(j.gr) === f.gr.digits);
        line.push(`judge pg=${f.pg.digits}/${j.pg} gr=${f.gr?.digits}/${j.gr} [${lines.map((x) => x.text).join(" | ")}]`);
      }
      if (f?.gap?.boxes && f.gap.size) {
        const b = union(f.gap.boxes), h = b.y1 - b.y0;
        const lines = await engine.readLines(await crop(file, f.gap.size, { x0: b.x0 - 6 * h, y0: b.y0 - 5 * h, x1: b.x1 + h, y1: b.y1 + 1.5 * h }));
        const g = parseRankGap(lines.map((x) => x.text));
        const ok = g?.gap === Number(f.gap.digits);
        bump("gap", ok);
        line.push(`gap ${f.gap.rank}${f.gap.sign}${f.gap.digits} ${ok ? "○" : "×"} → ${JSON.stringify(g ?? null)} [${lines.map((x) => x.text).join(" | ")}]`);
      }
      out.push(line.join("\n  "));
    }
    await engine.destroy();
    out.push(`\n[${MODEL}] ` + Object.entries(tally).map(([k, [a, b]]) => `${k} ${a}/${b}`).join("  "));
    writeFileSync(`internal/paddle-regions-${MODEL}.txt`, out.join("\n"));
    console.log(out.at(-1));
  }, 900000);
});
