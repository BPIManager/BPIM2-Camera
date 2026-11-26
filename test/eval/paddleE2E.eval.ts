import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import type { OcrLine } from "@/lib/recognition/paddle/engine";
import { rawFromPaddle } from "@/lib/recognition/paddle/fromPaddle";
import type { SongMasterEntry } from "@/lib/songs/types";
import { createNodeEngine } from "./paddleNode";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Field { digits: string; boxes?: Box[]; size?: { w: number; h: number } }
interface Label { image: string; digits?: string; boxes?: Box[]; size?: { w: number; h: number }; fields?: { pg?: Field; gr?: Field; gap?: Field } }
const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });
const META = /NOTES?|ANOTHER|HYPER|LEGGENDARIA/i;

describe("paddle E2E", () => {
  it("曲・EX の確定率を測る", async () => {
    const master: SongMasterEntry[] = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
    const labels = JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as Label[];
    const engine = await createNodeEngine("small");
    const out: string[] = [];
    const t = { n: 0, confirmedOk: 0, confirmedBad: 0, unconfirmed: 0, candOk: 0 };
    for (const l of labels) {
      if (!l.digits || !l.boxes || !l.size) continue;
      const S = l.size;
      const base = await sharp(path.join(DIR, l.image)).rotate().resize({ width: S.w, height: S.h, fit: "fill" }).png().toBuffer();
      const crop = async (r: Box, width: number) => {
        const left = Math.min(S.w - 2, Math.max(0, Math.round(r.x0))), top = Math.min(S.h - 2, Math.max(0, Math.round(r.y0)));
        const w = Math.max(2, Math.min(S.w - left, Math.round(r.x1) - left)), h = Math.max(2, Math.min(S.h - top, Math.round(r.y1) - top));
        const png = await sharp(base).extract({ left, top, width: w, height: h }).resize({ width }).png().toBuffer();
        return engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      };
      const b = union(l.boxes), h = b.y1 - b.y0;
      const score = [await crop({ x0: b.x0 - 1.5 * h, y0: b.y0 - 0.8 * h, x1: b.x1 + 1.5 * h, y1: b.y1 + 0.8 * h }, 400), await crop({ x0: b.x0 - 1.5 * h, y0: b.y0 - 0.8 * h, x1: b.x1 + 1.5 * h, y1: b.y1 + 0.8 * h }, 1100)];
      // 曲名の枠: 全体画像から難易度・ノーツ数の行を探し、その周りを切り出す
      const full = await engine.readLines(base.buffer.slice(base.byteOffset, base.byteOffset + base.byteLength) as ArrayBuffer);
      const meta = full.filter((x: OcrLine) => META.test(x.text)).sort((a, c) => c.box.y - a.box.y)[0];
      const title = meta ? await crop({ x0: meta.box.x - 0.4 * meta.box.width, y0: meta.box.y - 3.4 * meta.box.height, x1: meta.box.x + 3.2 * meta.box.width, y1: meta.box.y + 2.2 * meta.box.height }, 900) : [];
      let judge: OcrLine[] | undefined;
      const f = l.fields;
      if (f?.pg?.boxes) {
        const p = union(f.pg.boxes), g = f.gr?.boxes ? union(f.gr.boxes) : p, ph = p.y1 - p.y0;
        judge = await crop({ x0: p.x0 - 8 * ph, y0: p.y0 - 0.6 * ph, x1: p.x1 + ph, y1: g.y1 + 4.5 * ph }, 700);
      }
      let rank: OcrLine[] | undefined;
      if (f?.gap?.boxes) {
        const g = union(f.gap.boxes), gh = g.y1 - g.y0;
        rank = await crop({ x0: g.x0 - 6 * gh, y0: g.y0 - 5 * gh, x1: g.x1 + gh, y1: g.y1 + 1.5 * gh }, 700);
      }
      const raw = rawFromPaddle({ title, score, judge, rank }, master);
      t.n++;
      const v = raw?.exScore.value ?? null;
      const status = v === null ? "未確定" : String(v) === l.digits ? "確定○" : "確定×";
      if (v === null) { t.unconfirmed++; if (raw?.exCandidates?.includes(Number(l.digits))) t.candOk++; }
      else if (String(v) === l.digits) t.confirmedOk++; else t.confirmedBad++;
      out.push(`${l.image}: ${status} 正解=${l.digits} 読み=${v} 候補=${JSON.stringify(raw?.exCandidates)} | 曲名行="${title.map((x) => x.text).join(" / ")}" → ${raw?.titleText ?? "-"} notes=${raw?.notes ?? "-"} ${raw?.difficulty ?? ""}${raw?.level ?? ""}`);
    }
    await engine.destroy();
    out.push(`\n対象 ${t.n} 枚: 確定して正解 ${t.confirmedOk} / 確定して誤り ${t.confirmedBad} / 未確定 ${t.unconfirmed}（うち候補に正解あり ${t.candOk}）`);
    writeFileSync("internal/paddle-e2e.txt", out.join("\n"));
    console.log(out.at(-1));
  }, 1800000);
});
