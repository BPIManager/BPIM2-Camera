import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { panelRegions } from "@/lib/vision/panelRegions";
import { createNodeEngine } from "./paddleNode";

/**
 * CLEAR TYPE の行を、アプリと同じ手順（スコア欄・判定表の枠から位置を計算 → 切り出し → OCR）で読み、
 * 行（文字・位置）を internal/clearType-read.json に保存する: pnpm eval clearTypeRead（集計は pnpm eval clearTypeParse）
 * REGION=clearTypeWide で、読み直し用の範囲を読む。SAVE=1 なら切り出し画像を internal/ct-<id>.jpg に保存する
 */
const REGION = process.env.REGION === "clearTypeWide" ? "clearTypeWide" : "clearType";

it("clear type read", async () => {
  const engine = await createNodeEngine("small");
  const locs = readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rows: { id: string; lines: { text: string; conf: number; x: number; w: number }[] | null }[] = [];
  for (const loc of locs) {
    const file = `internal/captures/${loc.id}_full.jpg`;
    const m = await sharp(file).metadata();
    const W = m.width!, H = m.height!;
    const px = (o: { x: number; y: number; width: number; height: number }) => ({ x: o.x * W, y: o.y * H, width: o.width * W, height: o.height * H });
    const r = panelRegions({ score: px(loc.score), judge: px(loc.judge) }, { width: W, height: H })[REGION];
    if (!r) {
      rows.push({ id: loc.id, lines: null });
      continue;
    }
    const crop = sharp(file).extract({ left: Math.round(r.x), top: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    if (process.env.SAVE) await crop.clone().jpeg().toFile(`internal/ct-${loc.id}.jpg`);
    const png = await crop.resize({ width: 700 }).png().toBuffer();
    const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
    rows.push({ id: loc.id, lines: lines.map((l) => ({ text: l.text, conf: Math.round(l.confidence), x: Math.round(l.box.x), w: Math.round(l.box.width) })) });
  }
  await engine.destroy();
  writeFileSync("internal/clearType-read.json", JSON.stringify(rows, null, 1));
}, 1_800_000);
