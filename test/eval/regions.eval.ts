import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { describe, it } from "vitest";
import { rawFromRegions } from "@/lib/recognition/fromRegions";
import { resolveResult } from "@/lib/recognition/resolve";
import { maskVariant, type Variant } from "@/lib/recognition/ocr/preprocess";
import type { OcrToken } from "@/lib/recognition/tokens";
import type { SongMasterEntry } from "@/lib/songs/types";
import { GUIDE_LAYOUTS } from "@/lib/vision/guides";
import seed from "../../public/data/songs-master.json";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const master = seed.songs as SongMasterEntry[];

async function read(worker: Awaited<ReturnType<typeof createWorker>>, file: string, n: { x: number; y: number; width: number; height: number }, variants: Variant[], width: number) {
  const meta = await sharp(file).metadata();
  const W = meta.width!, H = meta.height!;
  const region = { left: Math.round(n.x * W), top: Math.round(n.y * H), width: Math.round(n.width * W), height: Math.round(n.height * H) };
  region.width = Math.min(region.width, W - region.left);
  const { data, info } = await sharp(file).extract(region).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out: OcrToken[][] = [];
  for (const v of variants) {
    const px = maskVariant(new Uint8ClampedArray(data), v);
    const png = await sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    const r = await worker.recognize(png, {}, { blocks: true });
    const t: OcrToken[] = [];
    for (const b of r.data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) if (w.text.trim()) t.push({ text: w.text.trim(), confidence: w.confidence });
    out.push(t);
  }
  return out;
}

describe("regions", () => {
  it("ガイド枠の位置で切り出して読む", async () => {
    const lines: string[] = [];
    const worker = await createWorker("eng");
    for (const f of readdirSync(DIR).filter((x) => x.startsWith("1p-preview"))) {
      const file = path.join(DIR, f);
      await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const title = await read(worker, file, GUIDE_LAYOUTS["1P"].title, ["white", "contrast", "bright"], 1400);
      await worker.setParameters({ tessedit_char_whitelist: "0123456789+", tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const score = await read(worker, file, GUIDE_LAYOUTS["1P"].score, ["cyan", "white", "contrast", "bright"], 600);
      const raw = rawFromRegions(title.flat(), score.map((r) => r.map((t) => t.text)), master);
      const res = raw ? resolveResult(raw, master) : null;
      lines.push(`=== ${f}\ntitle: ${title.map((t) => t.map((x) => x.text).join(" ")).join(" || ")}\nscore: ${score.map((t) => t.map((x) => x.text).join(" ")).join(" || ")}\nresolved=${JSON.stringify(res && { chart: res.chart?.title, ex: res.exScore, cand: res.exCandidates, issues: res.issues, auto: res.autoConfirm })}`);
    }
    await worker.terminate();
    writeFileSync(process.env.EVAL_OUT ?? "eval-out.txt", lines.join("\n"));
  }, 600_000);
});
