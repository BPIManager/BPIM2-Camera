import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { parseUseOption } from "@/lib/recognition/useOption";
import { panelRegions } from "@/lib/vision/panelRegions";
import { createNodeEngine } from "./paddleNode";

/**
 * 使用オプションを、アプリと同じ手順（スコア欄・判定表の枠から位置を計算 → 切り出し → OCR → 照らし合わせ）で読む（#19）: pnpm eval useOptionRead
 * captures の写真は、すべて RANDOM か S-RANDOM。それ以外が出たら誤り
 */
it("use option read", async () => {
  const engine = await createNodeEngine("small");
  const locs = readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const t = { n: 0, outside: 0, read: 0, none: 0, other: 0 };
  const counts = new Map<string, number>();
  for (const loc of locs) {
    t.n++;
    const file = `internal/captures/${loc.id}_full.jpg`;
    const m = await sharp(file).metadata();
    const W = m.width!, H = m.height!;
    const px = (o: { x: number; y: number; width: number; height: number }) => ({ x: o.x * W, y: o.y * H, width: o.width * W, height: o.height * H });
    const r = panelRegions({ score: px(loc.score), judge: px(loc.judge) }, { width: W, height: H }).useOption;
    if (!r) {
      t.outside++;
      continue;
    }
    const png = await sharp(file).extract({ left: Math.round(r.x), top: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }).resize({ width: 700 }).png().toBuffer();
    const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
    const opt = parseUseOption(lines);
    if (process.env.SAVE) await sharp(file).extract({ left: Math.round(r.x), top: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }).jpeg().toFile(`internal/opt-${opt ? "ok" : "ng"}-${loc.id}.jpg`);
    counts.set(opt ?? "(読めず)", (counts.get(opt ?? "(読めず)") ?? 0) + 1);
    if (opt === null) t.none++;
    else if (opt === "RANDOM" || opt === "S-RANDOM") t.read++;
    else {
      t.other++;
      console.log(`  ${loc.id}: ${opt} [${lines.map((l) => l.text).join(" | ")}]`);
    }
  }
  await engine.destroy();
  console.log(`[useOption] n=${t.n} 写真の外 ${t.outside} / 読めた ${t.read} / 読めず ${t.none} / 誤り ${t.other}  ${JSON.stringify(Object.fromEntries(counts))}`);
}, 1_800_000);
