import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import type { DigitModel } from "@/lib/recognition/glyphs/classifier";
import { readScoreByGlyphs } from "@/lib/recognition/glyphs/readScore";

/**
 * ミスカウントを、水色の数字の分類器（public/models/digits.json。EX スコアの数字で学習したもの）で読めるか（#18）: pnpm eval missCountGlyph
 * 切り出しは missCount.eval の internal/miss-<id>.jpg（スコア欄の枠を 1 行分下にずらしたもの）。正解は internal/miss-labels.json
 */
it("miss count by glyphs", async () => {
  const model: DigitModel = JSON.parse(readFileSync("public/models/digits.json", "utf8"));
  const labels: Record<string, number | null> = JSON.parse(readFileSync("internal/miss-labels.json", "utf8"));
  for (const right of [1, 0.55, 0.4]) {
    for (const width of [0, 300, 500]) {
      const t = { ok: 0, bad: 0, none: 0 };
      const bad: string[] = [];
      for (const [id, truth] of Object.entries(labels)) {
        if (truth === null) continue;
        const file = `internal/miss-${id}.jpg`;
        const m = await sharp(file).metadata();
        const left = Math.round(m.width! * (1 - right));
        let img = sharp(file).extract({ left, top: 0, width: m.width! - left, height: m.height! });
        if (width) img = img.resize({ width });
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const r = readScoreByGlyphs({ data: new Uint8ClampedArray(data), width: info.width, height: info.height }, model);
        const v = r?.value ?? null;
        t[v === null ? "none" : v === truth ? "ok" : "bad"]++;
        if (v !== null && v !== truth) bad.push(`${id.slice(-6)}:${truth}→${v}`);
      }
      console.log(`[missGlyph] 右${right * 100}% 幅${width || "元"}: 正 ${t.ok} / 誤 ${t.bad} / 読めず ${t.none}   ${bad.slice(0, 6).join(" ")}`);
    }
  }
}, 600000);
