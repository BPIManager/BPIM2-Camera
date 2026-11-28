import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { estimateTilt } from "@/lib/vision/deskew";
import { toGray } from "@/lib/vision/frame";
import { maskVariant, type Variant } from "@/lib/recognition/ocr/preprocess";
import type { OcrLine } from "@/lib/recognition/paddle/engine";
import { createNodeEngine } from "./paddleNode";

/**
 * ミスカウントを、EX スコアと同じ読み方で読む（#18）: pnpm eval missSame
 * ミスカウントは EX スコアと書体・色・大きさが同じで、EX の 1 行下にある。そこで、
 * 1. 曲名の枠から傾きを求め、スコア欄のまわりをまっすぐにする
 * 2. スコア欄の枠を、下へ伸ばして（EX の行とミスカウントの行の 2 行）切り出す
 * 3a. スコア欄と同じ前処理で読み、EX の行のすぐ下の、差分（+0003 など）でない 1〜4 桁をミスカウントとする
 * 3b. EX の数字の右に、ミスカウントの行を並べた画像を作り、1 行として読む（1 桁だけだと、8 を B・日 のように文字として読むため）
 * 正解は internal/miss-labels.json（目で付けたもの）。SAVE=1 で、並べた画像を internal/miss3j-*.jpg に書き出す
 */
const VARIANTS: { name: string; width: number; mask: Variant | null }[] = [
  { name: "cyan700", width: 700, mask: "cyanFill" },
  { name: "raw700", width: 700, mask: null },
  { name: "gray700", width: 700, mask: "gray" },
];
/** 並べて読む方法。ミスカウントの行の位置は、EX の数字の箱の高さ h に対する割合（top は EX の箱の上端から、span は右端から左への幅） */
const CONCAT: { name: string; mask: Variant | null; top: number; height: number; span: number; padRight: number }[] = [
  { name: "join-cyan0", mask: "cyanFill", top: 1.2, height: 0.95, span: 2.6, padRight: 0.15 },
  { name: "join-raw0", mask: null, top: 1.2, height: 0.95, span: 2.6, padRight: 0.15 },
  { name: "join-cyan1", mask: "cyanFill", top: 1.1, height: 1.15, span: 2.6, padRight: 0.3 },
  { name: "join-raw1", mask: null, top: 1.1, height: 1.15, span: 2.6, padRight: 0.3 },
];
/** スコア欄の枠を下へ伸ばす倍率（枠の高さに対して） */
const EXTEND = Number(process.env.EXTEND ?? 2.4);

const digitsOf = (t: string) => t.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/\s+/g, "");
const SIGN = /^[+\-−]/;

async function readVariant(engine: { readLines(i: ArrayBuffer): Promise<OcrLine[]> }, png: Buffer, mask: Variant | null): Promise<OcrLine[]> {
  let out = png;
  if (mask) {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    out = await sharp(Buffer.from(maskVariant(new Uint8ClampedArray(data), mask)), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  }
  return engine.readLines(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * 水色の数字の画素（cyanFill）の、行ごとの数から、横に並ぶ帯を探す。いちばん背の高い帯が EX、その下の次の帯（EX の 4 割以上の高さ）がミスカウント。
 * 横は、それぞれの帯の中で水色の画素がある範囲（ミスカウントは EX の右端に右寄せなので、EX の右端から帯の高さ 4 つ分まで）
 */
async function findBands(png: Buffer): Promise<{ ex: Box; miss: Box } | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mask = maskVariant(new Uint8ClampedArray(data), "cyanFill");
  const on = (x: number, y: number) => mask[(y * W + x) * 4] === 0;
  const rowCount = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) rowCount[y]++;
  const thr = Math.max(3, W * 0.01);
  const bands: { y0: number; y1: number }[] = [];
  let start = -1, lastOn = -10;
  for (let y = 0; y <= H; y++) {
    const hit = y < H && rowCount[y]! >= thr;
    if (hit) {
      if (start < 0) start = y;
      else if (y - lastOn > 3) {
        bands.push({ y0: start, y1: lastOn + 1 });
        start = y;
      }
      lastOn = y;
    }
  }
  if (start >= 0) bands.push({ y0: start, y1: lastOn + 1 });
  if (bands.length < 2) return null;
  const exI = bands.reduce((bi, b, i) => (b.y1 - b.y0 > bands[bi]!.y1 - bands[bi]!.y0 ? i : bi), 0);
  const exB = bands[exI]!;
  const eh = exB.y1 - exB.y0;
  const missB = bands.slice(exI + 1).find((b) => b.y1 - b.y0 >= eh * 0.4);
  if (!missB) return null;
  const xRange = (b: { y0: number; y1: number }, lo: number, hi: number) => {
    const cols: number[] = [];
    for (let x = lo; x < hi; x++) {
      let n = 0;
      for (let y = b.y0; y < b.y1; y++) if (on(x, y)) n++;
      if (n >= 2) cols.push(x);
    }
    return cols.length ? { x0: cols[0]!, x1: cols[cols.length - 1]! + 1 } : null;
  };
  const ex = xRange(exB, 0, W);
  if (!ex) return null;
  const mh = missB.y1 - missB.y0;
  const miss = xRange(missB, Math.max(0, ex.x1 - mh * 4), Math.min(W, ex.x1 + mh));
  if (!miss) return null;
  const padY = (b: { y0: number; y1: number }) => Math.round((b.y1 - b.y0) * 0.15);
  return {
    ex: { x0: Math.max(0, ex.x0 - 4), x1: Math.min(W, ex.x1 + 4), y0: Math.max(0, exB.y0 - padY(exB)), y1: Math.min(H, exB.y1 + padY(exB)) },
    miss: { x0: Math.max(0, miss.x0 - 4), x1: Math.min(W, miss.x1 + 4), y0: Math.max(0, missB.y0 - padY(missB)), y1: Math.min(H, missB.y1 + padY(missB)) },
  };
}

/** 水色の画素がいちばん背高く並ぶ帯（EX の数字）。横は、帯の中で水色の画素が続く範囲のうち、いちばん長いもの（NEW RECORD のバッジを除く） */
async function findExBand(png: Buffer): Promise<Box | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mask = maskVariant(new Uint8ClampedArray(data), "cyanFill");
  const on = (x: number, y: number) => mask[(y * W + x) * 4] === 0;
  const rowCount = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) rowCount[y]++;
  const thr = Math.max(3, W * 0.03);
  let best: { y0: number; y1: number } | null = null;
  let start = -1, lastOn = -10;
  const close = () => {
    if (start >= 0 && (!best || lastOn + 1 - start > best.y1 - best.y0)) best = { y0: start, y1: lastOn + 1 };
  };
  for (let y = 0; y < H; y++) {
    if (rowCount[y]! < thr) continue;
    if (start < 0) start = y;
    else if (y - lastOn > 3) {
      close();
      start = y;
    }
    lastOn = y;
  }
  close();
  const b = best as { y0: number; y1: number } | null;
  if (!b || b.y1 - b.y0 < 8) return null;
  const eh = b.y1 - b.y0;
  // 列ごとに水色の画素があるか。数字の間のすき間（帯の高さの 0.4 倍まで）はつなぐ
  const runs: { x0: number; x1: number }[] = [];
  let rs = -1, last = -100;
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = b.y0; y < b.y1; y++) if (on(x, y)) n++;
    if (n < 2) continue;
    if (rs < 0) rs = x;
    else if (x - last > eh * 0.4) {
      runs.push({ x0: rs, x1: last + 1 });
      rs = x;
    }
    last = x;
  }
  if (rs >= 0) runs.push({ x0: rs, x1: last + 1 });
  const r = runs.sort((p, q) => q.x1 - q.x0 - (p.x1 - p.x0))[0];
  if (!r) return null;
  const pad = Math.round(eh * 0.12);
  return { x0: Math.max(0, r.x0 - 4), x1: Math.min(W, r.x1 + 4), y0: Math.max(0, b.y0 - pad), y1: Math.min(H, b.y1 + pad) };
}

/** EX の行（いちばん背の高い 3〜4 桁） */
function findEx(lines: readonly OcrLine[]): OcrLine | undefined {
  return lines.filter((l) => !SIGN.test(l.text.trim()) && /^\d{3,4}$/.test(digitsOf(l.text).replace(/[^0-9]/g, ""))).sort((a, b) => b.box.height - a.box.height)[0];
}

/** EX の行と、その下の行からミスカウントを選ぶ */
export function pickBelowEx(lines: readonly OcrLine[]): number | null {
  const ex = findEx(lines);
  if (!ex) return null;
  const exBottom = ex.box.y + ex.box.height;
  const exRight = ex.box.x + ex.box.width;
  const cands = lines
    .filter((l) => l !== ex)
    .map((l) => ({ l, t: digitsOf(l.text) }))
    .filter(({ t }) => !SIGN.test(t))
    .map(({ l, t }) => ({ l, d: t.replace(/[^0-9]/g, ""), t }))
    .filter(({ d, t }) => d.length >= 1 && d.length <= 4 && d.length >= t.length - 1)
    .filter(({ l }) => l.box.y + l.box.height / 2 > exBottom - ex.box.height * 0.2 && l.box.y < exBottom + ex.box.height * 1.5)
    .filter(({ l }) => l.box.height > ex.box.height * 0.6)
    .filter(({ l }) => Math.abs(l.box.x + l.box.width - exRight) < ex.box.height * 1.5);
  if (cands.length === 0) return null;
  return Number(cands.sort((a, b) => a.l.box.y - b.l.box.y)[0]!.d);
}

it("miss count read like EX", async () => {
  const labels: Record<string, number | null> = JSON.parse(readFileSync("internal/miss-labels.json", "utf8"));
  const locs = new Map(
    readFileSync("internal/crop-locations.jsonl", "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .map((l) => [l.id as string, l]),
  );
  const engine = await createNodeEngine((process.env.MODEL as "small") ?? "small");
  const rows: Record<string, unknown>[] = [];
  for (const [id, truth] of Object.entries(labels)) {
    if (truth === null) continue;
    const loc = locs.get(id);
    if (!loc) continue;
    const full = `internal/captures/${id}_full.jpg`;
    const m = await sharp(full).metadata();
    const W = m.width!, H = m.height!;
    const t = await sharp(`internal/captures/${id}_title.jpg`).resize({ width: 320 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const angle = estimateTilt(toGray(new Uint8ClampedArray(t.data), t.info.width, t.info.height)).angle;
    const s = { x: loc.score.x * W, y: loc.score.y * H, w: loc.score.width * W, h: loc.score.height * H };
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const pad = Math.round(Math.max(s.w, s.h * EXTEND) * 1.2);
    const left = Math.max(0, Math.round(cx - pad)), top = Math.max(0, Math.round(cy - pad));
    const right = Math.min(W, Math.round(cx + pad)), bottom = Math.min(H, Math.round(cy + pad));
    const rotated = await sharp(full).extract({ left, top, width: right - left, height: bottom - top }).rotate(-angle, { background: "#000" }).toBuffer();
    const rm = await sharp(rotated).metadata();
    const ox = cx - left - (right - left) / 2, oy = cy - top - (bottom - top) / 2;
    const rad = (-angle * Math.PI) / 180;
    const ncx = rm.width! / 2 + ox * Math.cos(rad) - oy * Math.sin(rad), ncy = rm.height! / 2 + ox * Math.sin(rad) + oy * Math.cos(rad);
    const cl = Math.max(0, Math.round(ncx - s.w / 2)), ct = Math.max(0, Math.round(ncy - s.h / 2));
    const cw = Math.min(rm.width! - cl, Math.round(s.w * 1.08)), ch = Math.min(rm.height! - ct, Math.round(s.h * EXTEND));
    const crop = await sharp(rotated).extract({ left: cl, top: ct, width: cw, height: ch }).png().toBuffer();
    const row: Record<string, unknown> = { id, truth, angle: +angle.toFixed(2) };

    for (const v of VARIANTS) {
      const lines = await readVariant(engine, await sharp(crop).resize({ width: v.width }).png().toBuffer(), v.mask);
      row[v.name] = pickBelowEx(lines);
    }

    const base = await sharp(crop).resize({ width: 700 }).png().toBuffer();
    const bm = await sharp(base).metadata();
    const ex = findEx(await readVariant(engine, base, "cyanFill"));
    row.ex = ex ? `${ex.text}[${ex.box.x | 0},${ex.box.y | 0},${ex.box.width | 0},${ex.box.height | 0}]` : null;
    for (const v of CONCAT) {
      let value: number | null = null;
      if (ex) {
        const h = ex.box.height;
        const exBox = { left: Math.max(0, Math.round(ex.box.x)), top: Math.max(0, Math.round(ex.box.y)), width: 0, height: 0 };
        exBox.width = Math.min(Math.round(ex.box.width), bm.width! - exBox.left);
        exBox.height = Math.min(Math.round(h), bm.height! - exBox.top);
        const r = Math.min(bm.width!, Math.round(ex.box.x + ex.box.width + h * v.padRight));
        const mLeft = Math.max(0, Math.round(r - h * v.span));
        const mTop = Math.round(ex.box.y + h * v.top);
        const mH = Math.min(bm.height! - mTop, Math.round(h * v.height));
        if (mH > 8 && r - mLeft > 8) {
          const exImg = await sharp(base).extract(exBox).toBuffer();
          const missImg = await sharp(base).extract({ left: mLeft, top: mTop, width: r - mLeft, height: mH }).resize({ height: exBox.height }).toBuffer();
          const mw = (await sharp(missImg).metadata()).width!;
          const gap = Math.round(h * 0.3);
          const joined = await sharp({ create: { width: exBox.width + gap + mw, height: exBox.height, channels: 3, background: "#000" } })
            .composite([
              { input: exImg, left: 0, top: 0 },
              { input: missImg, left: exBox.width + gap, top: 0 },
            ])
            .png()
            .toBuffer();
          if (process.env.SAVE) await sharp(joined).jpeg().toFile(`internal/miss3j-${id}-${v.name}.jpg`);
          const lines = await readVariant(engine, joined, v.mask);
          row[`${v.name}:lines`] = lines.map((l) => l.text).join(" ");
          const exDigits = digitsOf(ex.text).replace(/[^0-9]/g, "");
          const all = lines.map((l) => digitsOf(l.text)).join("");
          const i = all.indexOf(exDigits);
          const rest = (i >= 0 ? all.slice(i + exDigits.length) : "").replace(SIGN, "");
          const d = /^\d{1,4}/.exec(rest)?.[0];
          value = d ? Number(d) : null;
        }
      }
      row[v.name] = value;
    }
    // OCR の検出した箱から、EX の真下で右寄せのもの（文字として読み違えていてもよい）を選び、EX の右に並べて読み直す
    const exB = await findExBand(base);
    row.exBand = exB ? JSON.stringify(exB) : null;
    if (exB) {
      const eh = exB.y1 - exB.y0;
      const cands: OcrLine[] = [];
      for (const mask of [null, "gray", "cyanFill", "contrast"] as const) {
        for (const l of await readVariant(engine, base, mask)) {
          const b = l.box;
          const text = l.text.trim();
          if (SIGN.test(text) || text.replace(/\s+/g, "").length > 4) continue;
          if (b.y + b.height / 2 < exB.y1 || b.y > exB.y1 + eh * 2.5) continue;
          if (b.height < eh * 0.4 || Math.abs(b.x + b.width - exB.x1) > eh * 1.5) continue;
          cands.push(l);
        }
      }
      const pick = cands.sort((a, b) => a.box.y - b.box.y)[0];
      row.cand = pick ? `${pick.text}[${pick.box.x | 0},${pick.box.y | 0},${pick.box.width | 0},${pick.box.height | 0}]` : null;
      if (pick) {
        const bm2 = { w: bm.width!, h: bm.height! };
        const p = pick.box;
        const mx0 = Math.max(0, Math.round(p.x - 4)), my0 = Math.max(0, Math.round(p.y - 2));
        const mx1 = Math.min(bm2.w, Math.round(p.x + p.width + 4)), my1 = Math.min(bm2.h, Math.round(p.y + p.height + 2));
        const exImg = await sharp(base).extract({ left: exB.x0, top: exB.y0, width: exB.x1 - exB.x0, height: eh }).toBuffer();
        const missImg = await sharp(base).extract({ left: mx0, top: my0, width: mx1 - mx0, height: my1 - my0 }).resize({ height: eh }).toBuffer();
        const mw = (await sharp(missImg).metadata()).width!;
        const gap = Math.round(eh * 0.25);
        const joined = await sharp({ create: { width: exB.x1 - exB.x0 + gap + mw, height: eh, channels: 3, background: "#000" } })
          .composite([
            { input: exImg, left: 0, top: 0 },
            { input: missImg, left: exB.x1 - exB.x0 + gap, top: 0 },
          ])
          .extend({ top: Math.round(eh * 0.3), bottom: Math.round(eh * 0.3), left: Math.round(eh * 0.3), right: Math.round(eh * 0.3), background: "#000" })
          .png()
          .toBuffer();
        if (process.env.SAVE) await sharp(joined).jpeg().toFile(`internal/miss3c-${id}.jpg`);
        const exAlone = await readVariant(engine, await sharp(exImg).extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#000" }).png().toBuffer(), "cyanFill");
        const exDigits = exAlone.map((l) => digitsOf(l.text).replace(/[^0-9]/g, "")).join("");
        row.candEx = exDigits;
        for (const mask of ["cyanFill", null, "gray", "contrast"] as const) {
          const name = `cand-${mask ?? "raw"}`;
          const lines = await readVariant(engine, joined, mask);
          row[`${name}:lines`] = lines.map((l) => l.text).join(" ");
          const all = lines.map((l) => digitsOf(l.text).replace(SIGN, "")).join("").replace(/[^0-9]/g, "");
          let value: number | null = null;
          if (exDigits.length >= 3 && all.startsWith(exDigits) && all.length > exDigits.length) value = Number(all.slice(exDigits.length, exDigits.length + 4));
          row[name] = value;
        }
      }
    }
    // EX の 4 桁の幅 w を物差しにして、ミスカウントの行の位置を決めて並べる（行の間隔は w の約 0.4 倍）
    if (exB) {
      const w = exB.x1 - exB.x0, eh = exB.y1 - exB.y0, exC = (exB.y0 + exB.y1) / 2;
      for (const [wname, t0, t1] of [["win", 0.25, 0.55], ["winN", 0.28, 0.5]] as const) {
        const my0 = Math.max(0, Math.round(exC + w * t0)), my1 = Math.min(bm.height!, Math.round(exC + w * t1));
        const mx1 = Math.min(bm.width!, Math.round(exB.x1 + w * 0.1)), mx0 = Math.max(0, Math.round(exB.x1 - w * 0.85));
        if (my1 - my0 < 8 || mx1 - mx0 < 8) continue;
        const exImg = await sharp(base).extract({ left: exB.x0, top: exB.y0, width: w, height: eh }).toBuffer();
        const missImg = await sharp(base).extract({ left: mx0, top: my0, width: mx1 - mx0, height: my1 - my0 }).resize({ height: eh }).toBuffer();
        const mw = (await sharp(missImg).metadata()).width!;
        const gap = Math.round(eh * 0.25);
        const joined = await sharp({ create: { width: w + gap + mw, height: eh, channels: 3, background: "#000" } })
          .composite([
            { input: exImg, left: 0, top: 0 },
            { input: missImg, left: w + gap, top: 0 },
          ])
          .extend({ top: Math.round(eh * 0.3), bottom: Math.round(eh * 0.3), left: Math.round(eh * 0.3), right: Math.round(eh * 0.3), background: "#000" })
          .png()
          .toBuffer();
        if (process.env.SAVE) await sharp(joined).jpeg().toFile(`internal/miss3w-${id}-${wname}.jpg`);
        const exAlone = await readVariant(engine, await sharp(exImg).extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#000" }).png().toBuffer(), "cyanFill");
        const exDigits = exAlone.map((l) => digitsOf(l.text).replace(/[^0-9]/g, "")).join("");
        for (const mask of ["cyanFill", "cyanFillLoose", null, "gray", "contrast"] as const) {
          const name = `${wname}-${mask ?? "raw"}`;
          const lines = await readVariant(engine, joined, mask);
          row[`${name}:lines`] = lines.map((l) => l.text).join(" ");
          const all = lines.map((l) => digitsOf(l.text).replace(SIGN, "")).join("").replace(/[^0-9]/g, "");
          row[name] = exDigits.length >= 3 && all.startsWith(exDigits) && all.length > exDigits.length ? Number(all.slice(exDigits.length, exDigits.length + 4)) : null;
        }
      }
    }
    // 水色の画素の分布で、EX の行とミスカウントの行を見つけて並べる
    const bands = await findBands(base);
    row.bands = bands ? JSON.stringify(bands) : null;
    if (bands) {
      const { ex: e, miss: mm } = bands;
      const exImg = await sharp(base).extract({ left: e.x0, top: e.y0, width: e.x1 - e.x0, height: e.y1 - e.y0 }).toBuffer();
      const missImg = await sharp(base).extract({ left: mm.x0, top: mm.y0, width: mm.x1 - mm.x0, height: mm.y1 - mm.y0 }).resize({ height: e.y1 - e.y0 }).toBuffer();
      const mw = (await sharp(missImg).metadata()).width!;
      const eh = e.y1 - e.y0;
      const gap = Math.round(eh * 0.25);
      const joined = await sharp({ create: { width: e.x1 - e.x0 + gap + mw, height: eh, channels: 3, background: "#000" } })
        .composite([
          { input: exImg, left: 0, top: 0 },
          { input: missImg, left: e.x1 - e.x0 + gap, top: 0 },
        ])
        .extend({ top: Math.round(eh * 0.3), bottom: Math.round(eh * 0.3), left: Math.round(eh * 0.3), right: Math.round(eh * 0.3), background: "#000" })
        .png()
        .toBuffer();
      if (process.env.SAVE) await sharp(joined).jpeg().toFile(`internal/miss3b-${id}.jpg`);
      const exAlone = await readVariant(engine, await sharp(exImg).extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#000" }).png().toBuffer(), "cyanFill");
      const exDigits = exAlone.map((l) => digitsOf(l.text).replace(/[^0-9]/g, "")).join("");
      row.bandEx = exDigits;
      for (const mask of ["cyanFill", null, "cyanFillLoose"] as const) {
        const name = `band-${mask ?? "raw"}`;
        const lines = await readVariant(engine, joined, mask);
        row[`${name}:lines`] = lines.map((l) => l.text).join(" ");
        const all = lines.map((l) => digitsOf(l.text).replace(SIGN, "")).join("").replace(/[^0-9]/g, "");
        let value: number | null = null;
        if (exDigits.length >= 3 && all.startsWith(exDigits) && all.length > exDigits.length) value = Number(all.slice(exDigits.length, exDigits.length + 4));
        else if (lines.length >= 2) {
          const last = digitsOf(lines[lines.length - 1]!.text).replace(/[^0-9]/g, "");
          if (last.length >= 1 && last.length <= 4) value = Number(last);
        }
        row[name] = value;
      }
    }
    rows.push(row);
  }
  await engine.destroy();
  writeFileSync("internal/miss-same.json", JSON.stringify(rows, null, 1));
}, 3_600_000);
