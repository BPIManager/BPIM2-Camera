import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import type { OcrLine } from "@/lib/recognition/paddle/engine";
import { maskVariant, type Variant } from "@/lib/recognition/ocr/preprocess";
import { createNodeEngine } from "./paddleNode";

/**
 * ミスカウントの読み方の比較（#18）: pnpm eval missCountRead
 * 正解は目で付けたもの（internal/miss-labels.json）。切り出しは、撮影時のスコア欄の枠を、枠の高さ × 0.6 だけ下にずらしたもの（internal/miss-<id>.jpg）。
 * 差分（+0003 など）を除いた 1〜3 桁の数字のうち、いちばん背の高いものを、ミスカウントとして採る
 */
type V = { name: string; right: number; width: number; mask: Variant | null };
const VARIANTS: V[] = [
  { name: "全幅・水色", right: 1, width: 700, mask: "cyanFill" },
  { name: "右55%・水色", right: 0.55, width: 700, mask: "cyanFill" },
  { name: "右55%・水色（緩い）", right: 0.55, width: 700, mask: "cyanFillLoose" },
  { name: "右55%・元の画像", right: 0.55, width: 700, mask: null },
  { name: "右55%・グレー", right: 0.55, width: 700, mask: "gray" },
  { name: "右55%・元の画像・400", right: 0.55, width: 400, mask: null },
];

export function pickMiss(lines: readonly OcrLine[]): number | null {
  const cands = lines
    .map((l) => ({ t: l.text.trim().replace(/\s+/g, ""), h: l.box.height, c: l.confidence }))
    .filter((x) => !/^[+\-−]/.test(x.t))
    .map((x) => ({ ...x, d: x.t.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/[^0-9]/g, "") }))
    .filter((x) => x.d.length >= 1 && x.d.length <= 3 && x.d.length >= x.t.length - 2);
  if (cands.length === 0) return null;
  return Number(cands.sort((a, b) => b.h - a.h)[0]!.d);
}

it("miss count read", async () => {
  const labels: Record<string, number | null> = JSON.parse(readFileSync("internal/miss-labels.json", "utf8"));
  const engine = await createNodeEngine("small");
  const tally = new Map<string, { ok: number; bad: number; none: number }>();
  const votes = { ok: 0, bad: 0, none: 0 };
  const rows: unknown[] = [];
  for (const [id, truth] of Object.entries(labels)) {
    if (truth === null) continue;
    const file = `internal/${process.env.PREFIX ?? "miss"}-${id}.jpg`;
    const m = await sharp(file).metadata();
    const got: Record<string, number | null> = {};
    for (const v of VARIANTS) {
      const left = Math.round(m.width! * (1 - v.right));
      const base = sharp(file).extract({ left, top: 0, width: m.width! - left, height: m.height! }).resize({ width: v.width });
      let png: Buffer;
      if (!v.mask) png = await base.png().toBuffer();
      else {
        const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        png = await sharp(Buffer.from(maskVariant(new Uint8ClampedArray(data), v.mask)), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
      }
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      const value = pickMiss(lines);
      got[v.name] = value;
      const t = tally.get(v.name) ?? { ok: 0, bad: 0, none: 0 };
      t[value === null ? "none" : value === truth ? "ok" : "bad"]++;
      tally.set(v.name, t);
    }
    // 2 つ以上の読みが一致した値だけを採る（誤読を減らす）
    const counts = new Map<number, number>();
    for (const x of Object.values(got)) if (x !== null) counts.set(x, (counts.get(x) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    const voted = top && top[1] >= 2 && [...counts].filter(([, n]) => n === top[1]).length === 1 ? top[0] : null;
    votes[voted === null ? "none" : voted === truth ? "ok" : "bad"]++;
    rows.push({ id, truth, ...got, voted });
  }
  await engine.destroy();
  writeFileSync("internal/misscount-read.json", JSON.stringify(rows, null, 1));
  const n = rows.length;
  console.log(`[missCountRead] n=${n}`);
  for (const [k, t] of tally) console.log(`  ${k.padEnd(14)} 正 ${t.ok} / 誤 ${t.bad} / 読めず ${t.none}`);
  console.log(`  多数決（2 つ以上が一致） 正 ${votes.ok} / 誤 ${votes.bad} / 決まらず ${votes.none}`);
}, 3_600_000);
