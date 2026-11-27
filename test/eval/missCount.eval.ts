import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";
import { digitRuns, parseJudgeRows } from "@/lib/recognition/paddle/parse";
import { createNodeEngine } from "./paddleNode";

/**
 * ミスカウントを読めるかの評価（#18）: pnpm eval missCount
 * 撮影時のスコア欄の枠（internal/crop-locations.jsonl）を、1 行分（枠の高さ × SHIFT）下にずらして切り出し、
 * EX スコアと同じく水色だけを抜き出して読む。判定表（撮影時の切り出し）から読んだ BAD＋POOR と合うかを見る
 */
const SHIFTS = (process.env.SHIFTS ?? "0.6,0.75,0.9").split(",").map(Number);

it("miss count", async () => {
  const engine = await createNodeEngine("small");
  const locs = readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const png = async (buf: Buffer, width: number, mask: boolean) => {
    if (!mask) {
      const b = await sharp(buf).resize({ width }).png().toBuffer();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    }
    const { data, info } = await sharp(buf).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = await sharp(Buffer.from(maskVariant(new Uint8ClampedArray(data), "cyanFill")), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  };
  const tally: Record<string, { read: number; match: number; mismatch: number }> = {};
  let judged = 0;
  const rows: unknown[] = [];
  for (const loc of locs) {
    const full = `internal/captures/${loc.id}_full.jpg`;
    const m = await sharp(full).metadata();
    const W = m.width!, H = m.height!;
    // 判定表から BAD・POOR（正解の代わり）
    const judgeLines = await engine.readLines(await png(readFileSync(`internal/captures/${loc.id}_judge.jpg`), 1200, false));
    const j = parseJudgeRows(judgeLines);
    // 見出しが切れていて数字だけのときは、数字の行がちょうど 5 つなら、上から PG・GR・GOOD・BAD・POOR とみなす
    const numeric = judgeLines.filter((l) => /^[0-9OoIl]{1,4}$/.test(l.text.trim())).sort((a, b) => a.box.y - b.box.y);
    const n = (l: { text: string }) => Number(l.text.trim().replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
    const truth = j.bd !== undefined && j.poor !== undefined ? j.bd + j.poor : numeric.length === 5 ? n(numeric[3]!) + n(numeric[4]!) : null;
    if (truth !== null) judged++;
    const row: Record<string, unknown> = { id: loc.id, judge: truth };
    for (const k of SHIFTS) {
      const r = loc.score;
      const left = Math.round(r.x * W), top = Math.round((r.y + r.height * k) * H);
      const width = Math.round(r.width * W), height = Math.min(H - top, Math.round(r.height * H));
      if (height < 4) continue;
      const crop = await sharp(full).extract({ left, top, width, height }).toBuffer();
      const lines = await engine.readLines(await png(crop, 700, true));
      // 数字の並び（ミスカウントは 0〜4 桁。差分の「+0003」などは別の行）
      const nums = digitRuns(lines.map((l) => l.text)).filter((d) => d.length <= 4);
      const value = nums.length > 0 ? Number(nums[0]) : null;
      const t = (tally[k] ??= { read: 0, match: 0, mismatch: 0 });
      if (value !== null) t.read++;
      if (value !== null && truth !== null) t[value === truth ? "match" : "mismatch"]++;
      row[`k${k}`] = { text: lines.map((l) => `${l.text}(${Math.round(l.confidence)})`).join(" | "), value };
      if (k === SHIFTS[0] && process.env.SAVE) await sharp(crop).toFile(`internal/miss-${loc.id}.jpg`);
    }
    rows.push(row);
  }
  await engine.destroy();
  writeFileSync("internal/misscount.json", JSON.stringify(rows, null, 1));
  console.log(`[missCount] n=${locs.length} 判定表から BAD+POOR が分かった ${judged}`);
  for (const [k, t] of Object.entries(tally)) console.log(`  ずらし ${k}: 数字が読めた ${t.read} / 判定表と一致 ${t.match} / 不一致 ${t.mismatch}`);
}, 3_600_000);
