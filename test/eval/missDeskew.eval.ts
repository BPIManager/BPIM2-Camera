import { readFileSync, writeFileSync } from "node:fs";
import sharp, { type OverlayOptions } from "sharp";
import { it } from "vitest";
import { estimateTilt } from "@/lib/vision/deskew";
import { toGray } from "@/lib/vision/frame";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";
import { digitRuns } from "@/lib/recognition/paddle/parse";
import { createNodeEngine } from "./paddleNode";

/**
 * ミスカウントの切り出しを、傾きを直してから行う（#18）: pnpm eval missDeskew
 * 1. 曲名の枠（撮影時の切り出し）から傾きを推定する
 * 2. 全体画像のスコア欄のまわりを、その傾きだけ回してまっすぐにする
 * 3. まっすぐにした画像で、EX の数字（水色の塊がいちばん大きく並ぶところ）の外接矩形を求め、その真下 1 行分をミスカウントとして切り出す
 * 切り出しは internal/miss2-<id>.jpg、並べたものは internal/miss2-sheet-<n>.jpg（目で確かめる用）
 */
it("miss deskew crop", async () => {
  const locs = readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const ids: string[] = [];
  const info: Record<string, unknown> = {};
  const engine = await createNodeEngine("small");
  for (const loc of locs) {
    const id: string = loc.id;
    const full = `internal/captures/${id}_full.jpg`;
    const m = await sharp(full).metadata();
    const W = m.width!, H = m.height!;
    // 1. 曲名の枠から傾き
    const t = await sharp(`internal/captures/${id}_title.jpg`).resize({ width: 320 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const angle = estimateTilt(toGray(new Uint8ClampedArray(t.data), t.info.width, t.info.height)).angle;
    // 2. スコア欄を、アプリと同じく水色だけ抜き出して読み、EX の行の箱（いちばん背の高い、数字の行）を得る
    const s = loc.score;
    const sx = s.x * W, sy = s.y * H, sw = s.width * W, sh = s.height * H;
    const RW0 = 700;
    const sc = await sharp(`internal/captures/${id}_score.jpg`).resize({ width: RW0 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const png = await sharp(Buffer.from(maskVariant(new Uint8ClampedArray(sc.data), "cyanFill")), { raw: { width: sc.info.width, height: sc.info.height, channels: 4 } }).png().toBuffer();
    const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
    const exLine = lines.filter((l) => digitRuns([l.text]).some((d) => d.length >= 3)).sort((a, b) => b.box.height - a.box.height)[0];
    const k = sw / RW0; // 読んだ画像 → 全体画像
    const ex = exLine ? { x: sx + exLine.box.x * k, y: sy + exLine.box.y * k, w: exLine.box.width * k, h: exLine.box.height * k } : { x: sx + sw * 0.3, y: sy + sh * 0.2, w: sw * 0.7, h: sh * 0.6 };
    // 3. EX の行の中心のまわりを、傾きを打ち消す向きに回してまっすぐにし、その真下 1 行分を切り出す
    const pad = Math.round(Math.max(ex.w, ex.h * 4));
    const ccx = ex.x + ex.w / 2, ccy = ex.y + ex.h / 2;
    const left = Math.max(0, Math.round(ccx - pad)), top = Math.max(0, Math.round(ccy - pad));
    const right = Math.min(W, Math.round(ccx + pad)), bottom = Math.min(H, Math.round(ccy + pad));
    const rotated = await sharp(full).extract({ left, top, width: right - left, height: bottom - top }).rotate(-angle, { background: "#000" }).toBuffer();
    const rm = await sharp(rotated).metadata();
    const RW = rm.width!, RH = rm.height!;
    const ox = ccx - left - (right - left) / 2, oy = ccy - top - (bottom - top) / 2;
    const rad = (-angle * Math.PI) / 180;
    const ncx = RW / 2 + ox * Math.cos(rad) - oy * Math.sin(rad), ncy = RH / 2 + ox * Math.sin(rad) + oy * Math.cos(rad);
    // ミスカウントの行: EX の行の下、行の間隔は EX の行の高さの約 1.6 倍。右端は EX の行の右端より少し右まで
    const mx0 = ncx - ex.w * 0.7, mx1 = ncx + ex.w / 2 + ex.h * 0.8;
    const my0 = ncy + ex.h * 0.5, my1 = ncy + ex.h * 2.1;
    const cl = Math.max(0, Math.round(mx0)), ct = Math.max(0, Math.round(my0));
    const cw = Math.max(4, Math.min(RW - cl, Math.round(mx1 - mx0))), ch = Math.max(4, Math.min(RH - ct, Math.round(my1 - my0)));
    await sharp(rotated).extract({ left: cl, top: ct, width: cw, height: ch }).jpeg({ quality: 92 }).toFile(`internal/miss2-${id}.jpg`);
    const exFound = !!exLine;
    ids.push(id);
    info[id] = { angle: +angle.toFixed(2), ex: exFound };
  }
  await engine.destroy();
  writeFileSync("internal/miss2-info.json", JSON.stringify(info, null, 1));
  const per = 16;
  for (let s = 0; s * per < ids.length; s++) {
    const part = ids.slice(s * per, (s + 1) * per);
    const comps: OverlayOptions[] = [];
    for (const [i, id] of part.entries()) {
      comps.push({ input: await sharp(`internal/miss2-${id}.jpg`).resize({ width: 220, height: 70, fit: "contain", background: "#000" }).toBuffer(), top: i * 76, left: 40 });
      comps.push({ input: Buffer.from(`<svg width="40" height="70"><text x="2" y="40" font-size="18" fill="#ff0">${s * per + i}</text></svg>`), top: i * 76, left: 0 });
    }
    await sharp({ create: { width: 270, height: part.length * 76, channels: 3, background: "#222" } }).composite(comps).jpeg().toFile(`internal/miss2-sheet-${s}.jpg`);
  }
  console.log(`[missDeskew] n=${ids.length} EX の数字が見つかった ${Object.values(info).filter((x) => (x as { ex: boolean }).ex).length}`);
}, 600000);
