import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { it } from "vitest";
import { parseClearType } from "@/lib/recognition/clearType";
import { panelRegions } from "@/lib/vision/panelRegions";
import { createNodeEngine } from "./paddleNode";

/**
 * アプリと同じ切り出し（canvas の drawImage で、横 700 に拡大して画素にする。useCaptureReader の cropPixels）で、CLEAR TYPE の行を読む。
 * sharp で切り出した場合（clearTypeRead）と、読める・読めないが変わるかを調べる: LOCS=internal/crop-locations-new.jsonl pnpm eval clearTypeCanvas
 * 結果は internal/clearType-canvas.txt
 */
it("clear type canvas", async () => {
  const engine = await createNodeEngine("small");
  const locs = readFileSync(process.env.LOCS ?? "internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const out: string[] = [];
  for (const loc of locs) {
    const img = await loadImage(`internal/captures/${loc.id}_full.jpg`);
    const W = img.width, H = img.height;
    const px = (o: { x: number; y: number; width: number; height: number }) => ({ x: o.x * W, y: o.y * H, width: o.width * W, height: o.height * H });
    const at = panelRegions({ score: px(loc.score), judge: px(loc.judge) }, { width: W, height: H });
    const cells: string[] = [];
    for (const name of ["clearType", "clearTypeWide"] as const) {
      const r = at[name];
      if (!r) {
        cells.push(`${name}: (範囲外)`);
        continue;
      }
      const h = Math.max(1, Math.round((r.height * 700) / r.width));
      const c = createCanvas(700, h);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, 700, h);
      const lines = await engine.readLines(ctx.getImageData(0, 0, 700, h) as unknown as ImageData);
      const p = parseClearType(lines, 700);
      cells.push(`${name}[${Math.round(r.width)}x${Math.round(r.height)}→700x${h}]: ${p.current ?? "読めず"} (${lines.map((l) => l.text).join(" | ")})`);
    }
    out.push(`${loc.id}\n  ${cells.join("\n  ")}`);
  }
  await engine.destroy();
  writeFileSync("internal/clearType-canvas.txt", `${out.join("\n")}\n`);
}, 1_800_000);
