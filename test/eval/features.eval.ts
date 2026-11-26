import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { it } from "vitest";
import { locateScoreChains } from "@/lib/recognition/glyphs/locate";
import { colorMask, isCyan } from "@/lib/recognition/glyphs/segment";

const DIR = "D:/camera-example";
interface L { image: string; digits: string; hint: { x: number; y: number }; boxes?: { x0: number; y0: number; x1: number; y1: number }[]; skipped?: boolean }

it("真の数字列と誤検出の特徴量", async () => {
  const labels = (JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as L[]).filter((l) => !l.skipped && l.digits);
  const rows: { good: boolean; n: number; relH: number; fill: number; vmean: number; wh: number; image: string; rank: number }[] = [];
  let topGood = 0;
  const perImage: string[] = [];
  for (const l of labels) {
    const { data, info } = await sharp(path.join(DIR, l.image)).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = new Uint8ClampedArray(data);
    const mask = colorMask(rgba, isCyan);
    const chains = locateScoreChains(rgba, info.width, info.height, 12);
    const hx = (l.hint.x / 100) * info.width, hy = (l.hint.y / 100) * info.height;
    const goodRanks: number[] = [];
    chains.forEach((c, rank) => {
      const good = c.boxes.length === l.digits.length && Math.hypot(c.box.x - hx, c.box.y - hy) < info.width * 0.06;
      let area = 0, vsum = 0, vn = 0, bw = 0;
      for (const b of c.boxes) {
        area += b.area; bw += b.x1 - b.x0 + 1;
        for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (mask[y * info.width + x]) { const i = (y * info.width + x) * 4; vsum += Math.max(data[i], data[i + 1], data[i + 2]) / 255; vn++; }
      }
      const bh = c.boxes.reduce((a, b) => a + (b.y1 - b.y0 + 1), 0) / c.boxes.length;
      const fill = area / c.boxes.reduce((a, b) => a + (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1), 0);
      rows.push({ good, n: c.boxes.length, relH: bh / info.height, fill, vmean: vsum / Math.max(1, vn), wh: bw / c.boxes.length / bh, image: l.image, rank });
      if (rank === 0 && good) topGood++;
      if (good) goodRanks.push(rank);
    });
    perImage.push(l.image+" 正解"+l.digits+" 正解候補の順位: "+(goodRanks.length?goodRanks.join(","):"なし"));
  }
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(3);
  const g = rows.filter((r) => r.good), b = rows.filter((r) => !r.good);
  const lines = [...perImage, 
    `labeled images=${labels.length}  top1 が正解: ${topGood}/${labels.length}  真の候補 ${g.length} 個 / 誤検出 ${b.length} 個`,
    `真:  相対高さ=${avg(g.map((r) => r.relH))} 塗り率=${avg(g.map((r) => r.fill))} 明度=${avg(g.map((r) => r.vmean))} 幅/高さ=${avg(g.map((r) => r.wh))} 桁数=${avg(g.map((r) => r.n))}`,
    `誤:  相対高さ=${avg(b.map((r) => r.relH))} 塗り率=${avg(b.map((r) => r.fill))} 明度=${avg(b.map((r) => r.vmean))} 幅/高さ=${avg(b.map((r) => r.wh))} 桁数=${avg(b.map((r) => r.n))}`,
    `--- 分位(真/誤): 塗り率 ${[.1, .5, .9].map((p) => { const q = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]?.toFixed(2); return `${q(g.map((r) => r.fill))}/${q(b.map((r) => r.fill))}`; }).join("  ")}`,
    `    明度 ${[.1, .5, .9].map((p) => { const q = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]?.toFixed(2); return `${q(g.map((r) => r.vmean))}/${q(b.map((r) => r.vmean))}`; }).join("  ")}`,
    `    相対高さ ${[.1, .5, .9].map((p) => { const q = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]?.toFixed(3); return `${q(g.map((r) => r.relH))}/${q(b.map((r) => r.relH))}`; }).join("  ")}`,
    `    幅/高さ ${[.1, .5, .9].map((p) => { const q = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]?.toFixed(2); return `${q(g.map((r) => r.wh))}/${q(b.map((r) => r.wh))}`; }).join("  ")}`,
    `真の候補の順位(rank): ${g.map((r) => r.rank).join(",")}`,
  ];
  writeFileSync(process.env.EVAL_OUT!, lines.join("\n"));
}, 400000);
