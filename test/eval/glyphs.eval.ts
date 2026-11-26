import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { colorMask, components, isCyan, mergeFragments, segmentGlyphs } from "@/lib/recognition/glyphs/segment";
import { GUIDE_LAYOUTS } from "@/lib/vision/guides";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const OUT = process.env.EVAL_OUT_DIR ?? ".";

describe("glyphs", () => {
  it("スコア枠の水色の数字が桁ごとに切り出せるか", async () => {
    const lines: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.startsWith("1p-preview"))) {
      const file = path.join(DIR, f);
      const meta = await sharp(file).metadata();
      const n = GUIDE_LAYOUTS["1P"].score;
      const region = { left: Math.round(n.x * meta.width!), top: Math.round(n.y * meta.height!), width: Math.round(n.width * meta.width!), height: Math.round(n.height * meta.height!) };
      const { data, info } = await sharp(file).extract(region).resize({ height: 120 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const mask = colorMask(new Uint8ClampedArray(data), isCyan);
      const g = segmentGlyphs(mask, info.width, info.height);
      const raw = mergeFragments(components(mask, info.width, info.height)).filter((b) => b.area >= 12).map((b) => [b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, b.area]);
      lines.push(`  raw boxes [x0,y0,w,h,area]: ${JSON.stringify(raw)}`);
      lines.push(`${f}: crop ${info.width}x${info.height} glyphs=${g.length} ${JSON.stringify(g.map((x) => [x.x, x.width, x.height]))}`);
      const vis = Buffer.alloc(mask.length * 3);
      mask.forEach((v, i) => { vis[i * 3] = vis[i * 3 + 1] = vis[i * 3 + 2] = v ? 255 : 0; });
      await sharp(vis, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(path.join(OUT, `mask-${f.replace(/[^a-z0-9]/gi, "_")}.png`));
    }
    writeFileSync(path.join(OUT, "glyphs.txt"), lines.join("\n"));
  }, 120_000);
});
