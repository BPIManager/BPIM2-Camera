import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { screenPlausible } from "@/lib/vision/autoCapture";
import { createNodeEngine } from "./paddleNode";

/**
 * 自動撮影の判定のうち、スコア枠・判定枠を、位置が正しい切り出し（ラベルの座標の周り）で評価する。
 *   pnpm eval autoCaptureLabeled
 * 「枠が合っているとき、tiny の OCR で、それらしい文字があると判定できるか」（再現率）を見る。
 */
const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Field { digits: string; boxes?: Box[]; size?: { w: number; h: number } }
interface Label { image: string; digits?: string; boxes?: Box[]; size?: { w: number; h: number }; fields?: { pg?: Field; gr?: Field } }

const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });

async function crop(file: string, size: { w: number; h: number }, r: Box, width: number) {
  const base = sharp(await sharp(file).rotate().resize({ width: size.w, height: size.h, fit: "fill" }).png().toBuffer());
  const left = Math.min(size.w - 2, Math.max(0, Math.round(r.x0)));
  const top = Math.min(size.h - 2, Math.max(0, Math.round(r.y0)));
  const w = Math.max(2, Math.min(size.w - left, Math.round(r.x1) - left));
  const h = Math.max(2, Math.min(size.h - top, Math.round(r.y1) - top));
  const png = await base.extract({ left, top, width: w, height: h }).resize({ width: Math.min(width, w) }).png().toBuffer();
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}

describe("自動撮影の判定（位置が正しい切り出し）", () => {
  it("スコア枠・判定枠の再現率", async () => {
    const labels = JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as Label[];
    const engine = await createNodeEngine("tiny");
    const t = { score: [0, 0], judge: [0, 0] };
    const rows: string[] = [];
    for (const l of labels) {
      const file = path.join(DIR, l.image);
      const row = [l.image.padEnd(30)];
      if (l.digits && l.boxes && l.size) {
        const b = union(l.boxes);
        const h = b.y1 - b.y0;
        const lines = await engine.readLines(await crop(file, l.size, { x0: b.x0 - 1.5 * h, y0: b.y0 - 0.8 * h, x1: b.x1 + 1.5 * h, y1: b.y1 + 0.8 * h }, 320));
        const ok = screenPlausible({ score: lines, title: [], judge: [] }).score;
        t.score[1]++;
        if (ok) t.score[0]++;
        row.push(`スコア ${ok ? "○" : "×"} [${lines.map((x) => x.text).join(" | ")}]`);
      }
      const f = l.fields;
      if (f?.pg?.boxes && f.pg.size) {
        const p = union(f.pg.boxes);
        const g = f.gr?.boxes ? union(f.gr.boxes) : p;
        const h = p.y1 - p.y0;
        const lines = await engine.readLines(await crop(file, f.pg.size, { x0: p.x0 - 8 * h, y0: p.y0 - 0.6 * h, x1: p.x1 + h, y1: g.y1 + 4.5 * h }, 480));
        const ok = screenPlausible({ score: [], title: [], judge: lines }).judge;
        t.judge[1]++;
        if (ok) t.judge[0]++;
        row.push(`判定 ${ok ? "○" : "×"} [${lines.map((x) => x.text).join(" | ")}]`);
      }
      if (row.length > 1) rows.push(row.join("  "));
    }
    const summary = `スコア枠: ${t.score[0]}/${t.score[1]}\n判定枠: ${t.judge[0]}/${t.judge[1]}`;
    mkdirSync("internal", { recursive: true });
    writeFileSync("internal/autoCaptureLabeled.eval.txt", `${rows.join("\n")}\n\n${summary}\n`);
    console.log(summary);
    await engine.destroy();
  }, 600_000);
});
