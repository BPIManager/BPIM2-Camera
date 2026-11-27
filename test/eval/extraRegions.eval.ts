import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { apply, fitSimilarity } from "@/lib/vision/autoFrame";
import { GUIDE_KEYS } from "@/lib/vision/guides";
import { createNodeEngine } from "./paddleNode";

/**
 * 使用オプション・FAST/SLOW を、ユーザーの 3 つの枠から位置を計算して切り出せるかの評価（#19・#20）: pnpm eval extraRegions
 * 基準の写真（REF）での 3 つの枠と、各写真の 3 つの枠（撮影時の枠。internal/crop-locations.jsonl）を重ねる相似変換を求め、
 * 基準の写真での使用オプション・FAST/SLOW の領域を、同じ変換で各写真に移して切り出し、OCR する。
 * 切り出した画像は internal/extra-<kind>-<id>.jpg（目で確かめる用）
 */
const REF = "20261126101408";
// 基準の写真（1080×1920）での領域（画素）
const REGIONS = {
  option: { x: 20, y: 610, width: 290, height: 60 },
  fastslow: { x: 80, y: 1118, width: 240, height: 66 },
};

it("extra regions", async () => {
  const locs = new Map(readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((o) => [o.id, o]));
  const corners = (r: { x: number; y: number; width: number; height: number }) => [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x, y: r.y + r.height },
    { x: r.x + r.width, y: r.y + r.height },
  ];
  const px = (o: { x: number; y: number; width: number; height: number }, W: number, H: number) => ({ x: o.x * W, y: o.y * H, width: o.width * W, height: o.height * H });
  const ref = locs.get(REF)!;
  const refFrames = GUIDE_KEYS.flatMap((k) => corners(px(ref[k], 1080, 1920)));
  const engine = await createNodeEngine("small");
  const rows: Record<string, unknown>[] = [];
  for (const [id, loc] of locs) {
    const file = `internal/captures/${id}_full.jpg`;
    const m = await sharp(file).metadata();
    const W = m.width!, H = m.height!;
    const t = fitSimilarity(refFrames, GUIDE_KEYS.flatMap((k) => corners(px(loc[k], W, H))));
    const row: Record<string, unknown> = { id };
    for (const [kind, r] of Object.entries(REGIONS)) {
      const cs = corners(r).map((p) => apply(t, p));
      const x0 = Math.max(0, Math.min(...cs.map((c) => c.x))), y0 = Math.max(0, Math.min(...cs.map((c) => c.y)));
      const x1 = Math.min(W, Math.max(...cs.map((c) => c.x))), y1 = Math.min(H, Math.max(...cs.map((c) => c.y)));
      if (x1 - x0 < 8 || y1 - y0 < 8) {
        row[kind] = "（画像の外）";
        continue;
      }
      const crop = await sharp(file).extract({ left: Math.round(x0), top: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) }).toBuffer();
      await sharp(crop).jpeg().toFile(`internal/extra-${kind}-${id}.jpg`);
      const png = await sharp(crop).resize({ width: 700 }).png().toBuffer();
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      row[kind] = lines.map((l) => `${l.text}(${Math.round(l.confidence)})`).join(" | ");
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  await engine.destroy();
  writeFileSync("internal/extra-regions.json", JSON.stringify(rows, null, 1));
}, 3_600_000);
