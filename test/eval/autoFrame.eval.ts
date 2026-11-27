import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { matchChart } from "@/lib/songs/matcher";
import { apply, findAnchors, fitFrames, fitSimilarity, type AnchorKind, type CanonicalLayout, type ScanLine } from "@/lib/vision/autoFrame";
import { GUIDE_KEYS, type GuideKey, type NormRect } from "@/lib/vision/guides";

/**
 * 取り込みの枠の自動推定の調整と評価: pnpm eval autoFrame
 * - internal/crop-locations.jsonl: 撮影時の枠の、全体画像での位置（node internal/locate-crops.mjs で作る。正解として使う）
 * - internal/fullscan-<MODEL>-<SIDE>.json: 全体画像の OCR（pnpm eval fullScan で作る）
 * 基準の写真（REF）の枠に、各写真の正解の枠を重ねる変換を求め、各写真の手がかりの位置を基準の写真に戻して中央値をとり、基準の手がかりの位置とする。
 * そのうえで、手がかりから枠を置き、正解の枠との重なり（IoU）を測る。
 */
const REF = process.env.REF ?? "20261126101408";
const SCAN = process.env.SCAN ?? "internal/fullscan-small-1280.json";

type Rect = { x: number; y: number; width: number; height: number };
const iou = (a: NormRect, b: NormRect) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.width * a.height + b.width * b.height - inter);
};
/** b が a をどれだけ覆っているか（正解の枠の中身が、置いた枠に入っているか） */
const cover = (truth: NormRect, b: NormRect) => {
  const x0 = Math.max(truth.x, b.x), y0 = Math.max(truth.y, b.y), x1 = Math.min(truth.x + truth.width, b.x + b.width), y1 = Math.min(truth.y + truth.height, b.y + b.height);
  return (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / (truth.width * truth.height);
};
const corners = (r: Rect) => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x, y: r.y + r.height },
  { x: r.x + r.width, y: r.y + r.height },
];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const MASTER = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
/** 曲データの曲名との一致度（曲名の行を手がかりにするため） */
const titleScoreOf = (text: string) => matchChart(MASTER, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: text }).candidates[0]?.score ?? 0;

it("autoFrame", async () => {
  const truth = new Map<string, Record<GuideKey, NormRect>>();
  for (const line of readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n")) {
    const o = JSON.parse(line);
    if (GUIDE_KEYS.every((k) => o[k].ncc > 0.9)) truth.set(o.id, o);
  }
  const scan: Record<string, { lines: { text: string; confidence: number; x: number; y: number; w: number; h: number }[] }> = JSON.parse(readFileSync(SCAN, "utf8"));
  const sizes = new Map<string, { width: number; height: number }>();
  for (const id of Object.keys(scan)) {
    const m = await sharp(`internal/captures/${id}_full.jpg`).metadata();
    sizes.set(id, { width: m.width!, height: m.height! });
  }
  const px = (id: string, r: NormRect): Rect => ({ x: r.x * sizes.get(id)!.width, y: r.y * sizes.get(id)!.height, width: r.width * sizes.get(id)!.width, height: r.height * sizes.get(id)!.height });
  const linesOf = (id: string): ScanLine[] => {
    const s = sizes.get(id)!;
    return scan[id]!.lines.map((l) => ({ text: l.text, confidence: l.confidence, box: { x: l.x * s.width, y: l.y * s.height, width: l.w * s.width, height: l.h * s.height } }));
  };

  // 基準の手がかりの位置: 各写真の手がかりを、正解の枠どうしの変換で基準の写真に戻し、中央値をとる
  const ref = truth.get(REF)!;
  const refFrames = Object.fromEntries(GUIDE_KEYS.map((k) => [k, px(REF, ref[k])])) as Record<GuideKey, Rect>;
  const samples = new Map<AnchorKind, { x: number[]; y: number[] }>();
  for (const [id, t] of truth) {
    if (!scan[id]) continue;
    const toImg = fitSimilarity(
      GUIDE_KEYS.flatMap((k) => corners(refFrames[k])),
      GUIDE_KEYS.flatMap((k) => corners(px(id, t[k]))),
    );
    // 逆変換
    const inv = { s: 1 / toImg.s, cos: toImg.cos, sin: -toImg.sin, tx: 0, ty: 0 };
    for (const a of findAnchors(linesOf(id), sizes.get(id)!, titleScoreOf)) {
      const p = apply(inv, { x: a.x - toImg.tx, y: a.y - toImg.ty });
      const e = samples.get(a.kind) ?? { x: [], y: [] };
      e.x.push(p.x);
      e.y.push(p.y);
      samples.set(a.kind, e);
    }
  }
  const canon: CanonicalLayout = {
    anchors: Object.fromEntries([...samples].filter(([, v]) => v.x.length >= 3).map(([k, v]) => [k, { x: Math.round(median(v.x)), y: Math.round(median(v.y)) }])),
    frames: Object.fromEntries(GUIDE_KEYS.map((k) => [k, { x: Math.round(refFrames[k].x), y: Math.round(refFrames[k].y), width: Math.round(refFrames[k].width), height: Math.round(refFrames[k].height) }])) as CanonicalLayout["frames"],
  };
  for (const [k, v] of samples) console.log(`  ${k.padEnd(11)} n=${String(v.x.length).padStart(2)} x=${Math.round(median(v.x))}±${Math.round(median(v.x.map((x) => Math.abs(x - median(v.x)))))} y=${Math.round(median(v.y))}±${Math.round(median(v.y.map((y) => Math.abs(y - median(v.y)))))}`);
  // 基準の枠: 1 枚の写真の枠ではなく、手がかりで当てはめた各写真の正解の枠を、基準の写真に戻して中央値をとる（ふだんの枠の置き方に寄せる）
  if (process.env.FRAMES !== "ref") {
    const edges: Record<GuideKey, { x0: number[]; y0: number[]; x1: number[]; y1: number[] }> = { score: { x0: [], y0: [], x1: [], y1: [] }, title: { x0: [], y0: [], x1: [], y1: [] }, judge: { x0: [], y0: [], x1: [], y1: [] } };
    for (const [id, t] of truth) {
      if (!scan[id]) continue;
      const fit = fitFrames(findAnchors(linesOf(id), sizes.get(id)!, titleScoreOf), canon, sizes.get(id)!, 3);
      if (!fit) continue;
      const m = fit.transform;
      const back = (q: { x: number; y: number }) => {
        const x = (q.x - m.tx) / m.s, y = (q.y - m.ty) / m.s;
        return { x: m.cos * x + m.sin * y, y: -m.sin * x + m.cos * y };
      };
      for (const k of GUIDE_KEYS) {
        const r = px(id, t[k]);
        const a = back({ x: r.x, y: r.y }), b = back({ x: r.x + r.width, y: r.y + r.height });
        edges[k].x0.push(a.x); edges[k].y0.push(a.y); edges[k].x1.push(b.x); edges[k].y1.push(b.y);
      }
    }
    for (const k of GUIDE_KEYS) {
      const e = edges[k];
      if (e.x0.length < 5) continue;
      const x0 = median(e.x0), y0 = median(e.y0);
      canon.frames[k] = { x: Math.round(x0), y: Math.round(y0), width: Math.round(median(e.x1) - x0), height: Math.round(median(e.y1) - y0) };
    }
    console.log("  frames", JSON.stringify(canon.frames));
  }
  writeFileSync("internal/canon.json", JSON.stringify(canon, null, 2));

  // 評価: 手がかりから枠を置き、正解の枠と比べる
  let fitted = 0, good = 0;
  const per: Record<GuideKey, number[]> = { score: [], title: [], judge: [] };
  const covers: Record<GuideKey, number[]> = { score: [], title: [], judge: [] };
  const fails: string[] = [];
  for (const [id, t] of truth) {
    if (!scan[id]) continue;
    const fit = fitFrames(findAnchors(linesOf(id), sizes.get(id)!, titleScoreOf), canon, sizes.get(id)!, Number(process.env.MIN ?? 3));
    if (!fit) {
      fails.push(id);
      continue;
    }
    fitted++;
    const ious = GUIDE_KEYS.map((k) => iou(fit.layout[k], t[k]));
    GUIDE_KEYS.forEach((k, i) => {
      per[k].push(ious[i]!);
      covers[k].push(cover(t[k], fit.layout[k]));
    });
    if (ious.every((v) => v > 0.5)) good++;
    else if (process.env.VERBOSE) console.log(`  ずれ ${id} used=${fit.used} IoU ${ious.map((v) => v.toFixed(2)).join(" ")}`);
  }
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(2);
  console.log(`[autoFrame ${SCAN}] n=${truth.size} 置けた ${fitted}（うち 3 枠とも IoU>0.5: ${good}） 置けない ${fails.length}`);
  console.log(`  平均 IoU score ${avg(per.score)} title ${avg(per.title)} judge ${avg(per.judge)} / 正解の覆い score ${avg(covers.score)} title ${avg(covers.title)} judge ${avg(covers.judge)}`);
  console.log(`  置けない: ${fails.join(" ")}`);
}, 600000);
