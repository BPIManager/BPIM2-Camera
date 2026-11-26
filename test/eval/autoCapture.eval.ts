import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { screenPlausible } from "@/lib/vision/autoCapture";
import { GUIDE_KEYS, GUIDE_LAYOUTS, type GuideKey, type NormRect } from "@/lib/vision/guides";
import { createNodeEngine } from "./paddleNode";

/**
 * 自動撮影の判定（tiny の OCR + screenPlausible）の実画像での評価。
 *   pnpm eval autoCapture
 * 枠が合っている画像（既定の配置）では OK、枠をずらした画像（画面から外れたつもり）では NG になるのが良い。
 */
const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const TARGET: Record<GuideKey, number> = { score: 320, title: 640, judge: 480 };

async function regions(file: string, layout: Record<GuideKey, NormRect>, dx: number, dy: number) {
  const img = sharp(await sharp(file).rotate().png().toBuffer());
  const { width = 0, height = 0 } = await img.metadata();
  const out = {} as Record<GuideKey, ArrayBuffer>;
  for (const k of GUIDE_KEYS) {
    const r = layout[k];
    const left = Math.min(width - 4, Math.max(0, Math.round((r.x + dx) * width)));
    const top = Math.min(height - 4, Math.max(0, Math.round((r.y + dy) * height)));
    const w = Math.max(4, Math.min(width - left, Math.round(r.width * width)));
    const h = Math.max(4, Math.min(height - top, Math.round(r.height * height)));
    const png = await img.clone().extract({ left, top, width: w, height: h }).resize({ width: Math.min(TARGET[k], w) }).png().toBuffer();
    out[k] = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  }
  return out;
}

describe("自動撮影の判定", () => {
  it("枠が合っていれば OK、ずれれば NG", async () => {
    const files = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    const engine = await createNodeEngine("tiny");
    const cases = [
      { name: "合っている", dx: 0, dy: 0 },
      { name: "右下へずれた", dx: 0.18, dy: 0.22 },
      { name: "左上へずれた", dx: -0.2, dy: -0.14 },
    ];
    const tally = new Map<string, { all: number; score: number; title: number; judge: number; n: number }>();
    const rows: string[] = [];
    for (const f of files) {
      const layout = f.startsWith("2p-") ? GUIDE_LAYOUTS["2P"] : GUIDE_LAYOUTS["1P"];
      const cols: string[] = [];
      for (const c of cases) {
        const crops = await regions(path.join(DIR, f), layout, c.dx, c.dy);
        const [score, title, judge] = await Promise.all([engine.readLines(crops.score), engine.readLines(crops.title), engine.readLines(crops.judge)]);
        const p = screenPlausible({ score, title, judge });
        const t = tally.get(c.name) ?? { all: 0, score: 0, title: 0, judge: 0, n: 0 };
        t.n++;
        t.all += Number(p.all);
        t.score += Number(p.score);
        t.title += Number(p.title);
        t.judge += Number(p.judge);
        tally.set(c.name, t);
        cols.push(`${c.name}:${p.all ? "OK" : "NG"}(${p.score ? "S" : "-"}${p.title ? "T" : "-"}${p.judge ? "J" : "-"})`);
      }
      rows.push(`${f.padEnd(30)} ${cols.join("  ")}`);
    }
    const summary = [...tally.entries()]
      .map(([k, t]) => `${k}: 全部OK ${t.all}/${t.n}（スコア ${t.score}・曲名 ${t.title}・判定 ${t.judge}）`)
      .join("\n");
    // 標準出力は流れてしまうので、結果はファイルにも書く（internal は git 管理外）
    mkdirSync("internal", { recursive: true });
    writeFileSync("internal/autoCapture.eval.txt", `${rows.join("\n")}\n\n${summary}\n`);
    console.log(summary);
    await engine.destroy();
  }, 600_000);
});
