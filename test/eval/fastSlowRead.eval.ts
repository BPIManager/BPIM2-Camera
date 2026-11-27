import sharp from "sharp";
import { it } from "vitest";
import type { OcrLine } from "@/lib/recognition/paddle/engine";
import { createNodeEngine } from "./paddleNode";

/**
 * FAST/SLOW の数字の読み方の比較（#20）: pnpm eval fastSlowRead
 * 切り出し（internal/extra-fastslow-<id>.jpg。extraRegions で作る）を、目で読んだ値と比べる
 */
const TRUTH: Record<string, [number, number]> = {
  "20261126101408": [86, 73],
  "20261126111642": [78, 98],
  "20261126065201": [19, 12],
  "20261126110527": [20, 14],
  "20261126114120": [34, 27],
  "20261126120320": [24, 23],
  "20261126111703": [20, 61],
  "20261126061815": [86, 75],
  "20261126114818": [67, 41],
};

const toBuf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const num = (t: string) => {
  const d = t.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/[^0-9]/g, "");
  return d.length >= 1 && d.length <= 4 ? Number(d) : null;
};

/** 数字の行を上から 2 つ（FAST・SLOW の順）。見出し（FAST・SLOW・TIMING）と数字が 1 行につながっていれば、数字の部分を採る */
function pick(lines: readonly OcrLine[]): [number | null, number | null] {
  const nums = lines
    .map((l) => ({ y: l.box.y + l.box.height / 2, n: num((l.text.match(/[0-9OoIl|]{1,4}\s*$/)?.[0] ?? "").trim()) }))
    .filter((x): x is { y: number; n: number } => x.n !== null)
    .sort((a, b) => a.y - b.y);
  return [nums[0]?.n ?? null, nums[1]?.n ?? null];
}

it("fast slow read", async () => {
  const engine = await createNodeEngine("small");
  const tally = new Map<string, { ok: number; bad: number; none: number }>();
  const bump = (k: string, got: [number | null, number | null], t: [number, number]) => {
    const e = tally.get(k) ?? { ok: 0, bad: 0, none: 0 };
    e[got[0] === null || got[1] === null ? "none" : got[0] === t[0] && got[1] === t[1] ? "ok" : "bad"]++;
    tally.set(k, e);
  };
  for (const [id, t] of Object.entries(TRUTH)) {
    const file = `internal/extra-fastslow-${id}.jpg`;
    const out: string[] = [id];
    // A: 全体を拡大して読む
    for (const w of [700, 1400, 2000]) {
      const lines = await engine.readLines(toBuf(await sharp(file).resize({ width: w }).png().toBuffer()));
      const got = pick(lines);
      bump(`全体 ${w}`, got, t);
      out.push(`全体${w}: ${got.join("/")} [${lines.map((l) => l.text).join(" | ")}]`);
    }
    // B: 見出し（FAST・SLOW）の右の数字の列だけを切り出して拡大する
    const m = await sharp(file).metadata();
    const scale = 1400 / m.width!;
    const lines = await engine.readLines(toBuf(await sharp(file).resize({ width: 1400 }).png().toBuffer()));
    const labels = lines.filter((l) => /AS+T|[SU5][LU]?O[WV]|LOW/i.test(l.text));
    if (labels.length > 0) {
      const right = Math.max(...labels.map((l) => l.box.x + l.box.width)) / scale;
      const top = Math.min(...labels.map((l) => l.box.y)) / scale;
      const bottom = Math.max(...labels.map((l) => l.box.y + l.box.height)) / scale;
      const h = bottom - top;
      const left = Math.max(0, Math.round(right));
      const box = { left, top: Math.max(0, Math.round(top - h * 0.3)), width: Math.min(m.width! - left, Math.round(h * 1.6)), height: Math.min(m.height! - Math.max(0, Math.round(top - h * 0.3)), Math.round(h * 1.6)) };
      for (const w of [400, 800]) {
        const crop = await sharp(file).extract(box).resize({ width: w }).png().toBuffer();
        const nl = await engine.readLines(toBuf(crop));
        const got = pick(nl);
        bump(`数字の列 ${w}`, got, t);
        out.push(`列${w}: ${got.join("/")} [${nl.map((l) => l.text).join(" | ")}]`);
      }
    } else {
      bump("数字の列 400", [null, null], t);
      bump("数字の列 800", [null, null], t);
    }
    console.log(out.join("\n    "), "  正解", t.join("/"));
  }
  await engine.destroy();
  for (const [k, e] of tally) console.log(`[fastSlow] ${k.padEnd(10)} 正 ${e.ok} / 誤 ${e.bad} / 読めず ${e.none}`);
}, 1_800_000);
