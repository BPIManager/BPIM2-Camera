import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";

/** 2P の写真を全体 OCR して internal/fullscan-2p.json に保存する（取り込みの枠の自動推定の 2P の基準を作る用）: pnpm eval fullScan2p */
const FILES = ["2p-HSTE16ObEAA3Jso.jpg", "2p-HSa3QWtaEAAa6PB.jpg", "2p-HVw5dNXbkAAZMVR.jpg", "HV4q664bYAAS3Ul.jpg"];
it("full scan 2p", async () => {
  const engine = await createNodeEngine("small");
  const out: Record<string, { width: number; height: number; lines: { text: string; confidence: number; x: number; y: number; w: number; h: number }[] }> = {};
  for (const f of FILES) {
    const png = await sharp(`D:/camera-example/${f}`).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).png().toBuffer();
    const m = await sharp(png).metadata();
    const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
    out[f] = { width: m.width!, height: m.height!, lines: lines.map((l) => ({ text: l.text, confidence: Math.round(l.confidence), x: l.box.x, y: l.box.y, w: l.box.width, h: l.box.height })) };
  }
  writeFileSync("internal/fullscan-2p.json", JSON.stringify(out));
  await engine.destroy();
}, 600000);
