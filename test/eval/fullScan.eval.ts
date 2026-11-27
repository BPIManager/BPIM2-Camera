import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";

/**
 * 全体画像を長辺 SIDE（既定 1280）に縮めて 1 回読み、行を internal/fullscan-<SIDE>.json に保存する（取り込みの枠の自動推定の調整用）。
 * 位置は、縮める前の画像に対する割合で残す
 */
it("full scan", async () => {
  const engine = await createNodeEngine((process.env.MODEL ?? "small") as "small" | "tiny");
  const side = Number(process.env.SIDE ?? 1280);
  const ids = readdirSync("internal/captures").filter((f) => f.endsWith("_full.jpg")).map((f) => f.slice(0, -9)).sort();
  const out: Record<string, { ms: number; lines: { text: string; confidence: number; x: number; y: number; w: number; h: number }[] }> = {};
  for (const id of ids) {
    const png = await sharp(readFileSync(`internal/captures/${id}_full.jpg`)).resize({ width: side, height: side, fit: "inside" }).png().toBuffer();
    const meta = await sharp(png).metadata();
    const t = performance.now();
    const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
    out[id] = {
      ms: Math.round(performance.now() - t),
      lines: lines.map((l) => ({ text: l.text, confidence: Math.round(l.confidence), x: l.box.x / meta.width!, y: l.box.y / meta.height!, w: l.box.width / meta.width!, h: l.box.height / meta.height! })),
    };
  }
  writeFileSync(`internal/fullscan-${process.env.MODEL ?? "small"}-${side}.json`, JSON.stringify(out));
  const ms = Object.values(out).map((o) => o.ms);
  console.log(`n=${ms.length} 平均 ${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)}ms`);
  await engine.destroy();
}, 1_800_000);
