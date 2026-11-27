import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { createNodeEngine } from "./paddleNode";
import { judgeFromReads } from "@/lib/recognition/paddle/fromPaddle";

/**
 * 判定表の枠を、カメラの映像に合わせて自動で合わせられるか（#17）: MODEL=tiny pnpm eval judgeSnap
 * 撮影時の判定表の枠（正解）を、わざとずらした位置を「ユーザーの枠」とし、そのまわりを広めに切り出して読む。
 * 判定の見出し（GREAT・GOOD・BAD・POOR）の右の数字の列から枠を決め直し、正解の枠との重なり（IoU）と、ずらす前より良くなったかを見る
 */
const MODEL = (process.env.MODEL ?? "tiny") as "tiny" | "small";
const WIDTH = Number(process.env.WIDTH ?? 480);

type R = { x: number; y: number; width: number; height: number };
const iou = (a: R, b: R) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.width * a.height + b.width * b.height - inter);
};
const LABEL = /GREAT|GOOD|G[O0]{2}D|BAD|POOR|P[O0]{2}R/i;

it("judge snap", async () => {
  const engine = await createNodeEngine(MODEL);
  const locs = readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const t = { n: 0, found: 0, better: 0, worse: 0, iouBefore: 0, iouAfter: 0, ms: 0, judgeBefore: 0, judgeAfter: 0, judged: 0, judgeTruth: 0 };
  // 判定表の読みが正しいかの目安: PG×2＋GR が、撮影時の枠で確定した EX と合う組を取り出せるか
  const baseEx = new Map<string, number>((JSON.parse(readFileSync("internal/bench-baseline.json", "utf8")) as { id: string; ex: number | null }[]).filter((r) => r.ex !== null).map((r) => [r.id, r.ex!]));
  const reader = await createNodeEngine("small");
  const judgeOk = async (r: R, W: number, H: number, full: string, ex: number) => {
    const left = Math.max(0, Math.round(r.x)), top = Math.max(0, Math.round(r.y));
    const width = Math.max(4, Math.min(W - left, Math.round(r.width))), height = Math.max(4, Math.min(H - top, Math.round(r.height)));
    const b = await sharp(full).extract({ left, top, width, height }).resize({ width: 1200 }).png().toBuffer();
    const lines = await reader.readLines(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    const j = judgeFromReads([lines], new Set([ex]));
    return j?.pg !== undefined && j.gr !== undefined && j.pg * 2 + j.gr === ex;
  };
  // ずらし方: 枠の幅・高さに対する割合（右に 30%・下に 25% など）
  // 見出しの左端・上端・下端と文字の高さに対する、撮影時の枠（正解）の位置の比率。1 回目に集めて中央値をとる
  const geo = { x0: [] as number[], x1: [] as number[], y0: [] as number[], y1: [] as number[] };
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  let G: { x0: number; x1: number; y0: number; y1: number } | null = null;
  for (const pass of [0, 1]) {
  if (pass === 1) G = { x0: median(geo.x0), x1: median(geo.x1), y0: median(geo.y0), y1: median(geo.y1) };
  const SHIFTS = pass === 0 ? [[0, 0]] : [
    [0.3, 0.25],
    [-0.3, -0.2],
    [0.0, 0.35],
  ];
  for (const loc of locs) {
    const full = `internal/captures/${loc.id}_full.jpg`;
    void 0;
    const m = await sharp(full).metadata();
    const W = m.width!, H = m.height!;
    const truth: R = { x: loc.judge.x * W, y: loc.judge.y * H, width: loc.judge.width * W, height: loc.judge.height * H };
    for (const [dx, dy] of SHIFTS) {
      t.n++;
      const user: R = { x: truth.x + truth.width * dx, y: truth.y + truth.height * dy, width: truth.width, height: truth.height };
      // ユーザーの枠のまわり（左に枠の幅 1 つ分・上下に高さの 0.6 倍・右に 0.4 倍）を広く読む
      const left = Math.max(0, Math.round(user.x - user.width)), top = Math.max(0, Math.round(user.y - user.height * 0.6));
      const right = Math.min(W, Math.round(user.x + user.width * 1.4)), bottom = Math.min(H, Math.round(user.y + user.height * 1.6));
      const buf = await sharp(full).extract({ left, top, width: right - left, height: bottom - top }).resize({ width: WIDTH }).png().toBuffer();
      const k = (right - left) / WIDTH;
      const t0 = performance.now();
      const lines = await engine.readLines(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      t.ms += performance.now() - t0;
      const labels = lines.filter((l) => LABEL.test(l.text));
      t.iouBefore += iou(user, truth);
      if (labels.length < 2) {
        t.iouAfter += iou(user, truth);
        continue;
      }
      // 見出しの左端・上端・下端と、文字の高さ（見出しの箱の高さの中央値）
      const hs = labels.map((l) => l.box.height).sort((a, b) => a - b);
      const rowH = hs[Math.floor(hs.length / 2)]! * k;
      const lx0 = left + Math.min(...labels.map((l) => l.box.x)) * k;
      const ly0 = top + Math.min(...labels.map((l) => l.box.y)) * k, ly1 = top + Math.max(...labels.map((l) => l.box.y + l.box.height)) * k;
      if (pass === 0) {
        geo.x0.push((truth.x - lx0) / rowH);
        geo.x1.push((truth.x + truth.width - lx0) / rowH);
        geo.y0.push((truth.y - ly0) / rowH);
        geo.y1.push((truth.y + truth.height - ly1) / rowH);
        continue;
      }
      const g = G!;
      const nums: typeof labels = [];
      const snapped: R = { x: lx0 + g.x0 * rowH, y: ly0 + g.y0 * rowH, width: (g.x1 - g.x0) * rowH, height: ly1 - ly0 + (g.y1 - g.y0) * rowH };
      t.found++;
      const ex = baseEx.get(loc.id);
      if (ex !== undefined) {
        t.judged++;
        if (await judgeOk(user, W, H, full, ex)) t.judgeBefore++;
        if (await judgeOk(snapped, W, H, full, ex)) t.judgeAfter++;
        if (await judgeOk(truth, W, H, full, ex)) t.judgeTruth++;
        if (process.env.SAVE && t.judged <= 6) {
          const cut = async (r: R, name: string) => {
            const l = Math.max(0, Math.round(r.x)), tp = Math.max(0, Math.round(r.y));
            await sharp(full).extract({ left: l, top: tp, width: Math.max(4, Math.min(W - l, Math.round(r.width))), height: Math.max(4, Math.min(H - tp, Math.round(r.height))) }).jpeg().toFile(`internal/snap-${t.judged}-${name}.jpg`);
          };
          await cut(user, "user");
          await cut(snapped, "snapped");
          await cut(truth, "truth");
          console.log(`snap ${t.judged}: labels=${labels.map((l) => l.text).join(",")} nums=${nums.map((l) => l.text).join(",")}`);
        }
      }
      const a = iou(snapped, truth), b = iou(user, truth);
      t.iouAfter += a;
      if (a > b + 0.05) t.better++;
      else if (a < b - 0.05) t.worse++;
    }
  }
  if (pass === 0) {
    t.n = 0; t.found = 0; t.better = 0; t.worse = 0; t.iouBefore = 0; t.iouAfter = 0; t.ms = 0; t.judged = 0; t.judgeBefore = 0; t.judgeAfter = 0;
  }
  }
  console.log(`[judgeSnap] 比率（文字の高さ単位）: ${JSON.stringify(G)}`);
  await engine.destroy();
  await reader.destroy();
  console.log(`[judgeSnap ${MODEL} ${WIDTH}] EX が分かる試行 ${t.judged}: PG×2＋GR＝EX を読めた ずらした枠 ${t.judgeBefore} → 合わせ直した枠 ${t.judgeAfter}（撮影時の枠のまま ${t.judgeTruth}）`);
  console.log(`[judgeSnap ${MODEL} ${WIDTH}] 試行 ${t.n}: 見出しが見つかった ${t.found} / 良くなった ${t.better} / 悪くなった ${t.worse} / 平均 IoU ${(t.iouBefore / t.n).toFixed(2)} → ${(t.iouAfter / t.n).toFixed(2)} / 1 回の OCR ${Math.round(t.ms / t.n)}ms（Node）`);
}, 1_800_000);
