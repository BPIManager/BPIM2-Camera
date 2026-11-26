import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { it } from "vitest";
import { isCyan } from "@/lib/recognition/glyphs/segment";

const DIR = "D:/camera-example";
interface L { image: string; digits: string; boxes?: { x0: number; y0: number; x1: number; y1: number }[]; skipped?: boolean }

function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max / 255, s = max ? d / max : 0;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s, v };
}
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };

it("数字の水色と、それ以外の isCyan 画素の色分布", async () => {
  const labels = (JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as L[]).filter((l) => l.boxes?.length && !l.skipped);
  const digit = { h: [] as number[], s: [] as number[], v: [] as number[] };
  const other = { h: [] as number[], s: [] as number[], v: [] as number[] };
  for (const l of labels) {
    const { data, info } = await sharp(path.join(DIR, l.image)).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const inBox = (x: number, y: number) => l.boxes!.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
    // 数字の周辺（箱を 4 倍に広げた範囲）で、数字の箱の外にある isCyan 画素 = ラベル・バッジ等
    const X0 = Math.min(...l.boxes!.map((b) => b.x0)), X1 = Math.max(...l.boxes!.map((b) => b.x1));
    const Y0 = Math.min(...l.boxes!.map((b) => b.y0)), Y1 = Math.max(...l.boxes!.map((b) => b.y1));
    const H = Y1 - Y0;
    for (let y = Math.max(0, Y0 - H * 3); y < Math.min(info.height, Y1 + H * 3); y++) {
      for (let x = Math.max(0, X0 - H * 2); x < Math.min(info.width, X1 + H * 4); x++) {
        const i = (y * info.width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (!isCyan(r, g, b)) continue;
        const c = hsv(r, g, b);
        const t = inBox(x, y) ? digit : other;
        t.h.push(c.h); t.s.push(c.s); t.v.push(c.v);
      }
    }
  }
  const f = (t: typeof digit) => `n=${t.h.length} 色相 p5/50/95=${q(t.h, .05).toFixed(0)}/${q(t.h, .5).toFixed(0)}/${q(t.h, .95).toFixed(0)} 彩度 ${q(t.s, .05).toFixed(2)}/${q(t.s, .5).toFixed(2)}/${q(t.s, .95).toFixed(2)} 明度 ${q(t.v, .05).toFixed(2)}/${q(t.v, .5).toFixed(2)}/${q(t.v, .95).toFixed(2)}`;
  writeFileSync(process.env.EVAL_OUT!, `labels=${labels.length}\n数字: ${f(digit)}\nその他(ラベル・バッジ等): ${f(other)}`);
}, 300000);
