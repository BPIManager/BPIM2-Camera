import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { describe, it } from "vitest";
import { maskVariant, VARIANTS } from "@/lib/recognition/ocr/preprocess";
import { rawFromTokens } from "@/lib/recognition/fromTokens";
import { resolveResult } from "@/lib/recognition/resolve";
import type { OcrToken } from "@/lib/recognition/tokens";
import seed from "../../public/data/songs-master.json";
import type { SongMasterEntry } from "@/lib/songs/types";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const out: string[] = [];
const master = seed.songs as SongMasterEntry[];

describe("samples", () => {
  it("各サンプルを読んで結果を表示する", async () => {
    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    for (const f of readdirSync(DIR)) {
      const { data, info } = await sharp(path.join(DIR, f))
        .resize({ width: 1600 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const src = new Uint8ClampedArray(data);
      const tokens: OcrToken[] = [];
      const log: string[] = [];
      for (const v of VARIANTS) {
        const px = maskVariant(src, v);
        const png = await sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
        const r = await worker.recognize(png, {}, { blocks: true });
        const t: OcrToken[] = [];
        for (const b of r.data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) if (w.text.trim()) t.push({ text: w.text.trim(), confidence: w.confidence });
        tokens.push(...t);
        log.push(`${v}: ${t.filter((x) => x.confidence > 50).map((x) => x.text).join(" ")}`);
      }
      const raw = rawFromTokens(tokens, master);
      const res = raw ? resolveResult(raw, master) : null;
      out.push(`\n=== ${f}\n${log.join("\n")}\nraw=${JSON.stringify(raw && { ...raw, judge: raw.judge })}\nresolved=${JSON.stringify(res && { chart: res.chart?.title, ex: res.exScore, issues: res.issues, auto: res.autoConfirm })}`);
    }
    await worker.terminate();
    writeFileSync(process.env.EVAL_OUT ?? "eval-out.txt", out.join("\n"));
  }, 600_000);
});
