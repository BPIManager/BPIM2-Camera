import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { toGray } from "@/lib/vision/frame";
import { estimateTilt } from "@/lib/vision/deskew";

/** 保存したタイトル枠・手で切った写真で、推定した傾きを見る */
it("deskew estimate", async () => {
  writeFileSync("internal/deskew.txt", "");
  for (const f of (process.env.FILES ?? "").split(",").filter(Boolean)) {
    const { data, info } = await sharp(readFileSync(f)).resize({ width: 320 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const t = estimateTilt(toGray(new Uint8ClampedArray(data), info.width, info.height));
    appendFileSync("internal/deskew.txt", `${f.split(/[\/]/).pop()!.padEnd(34)} angle=${t.angle.toFixed(2).padStart(6)} gain=${t.gain.toFixed(3)}\n`);
  }
}, 120000);
