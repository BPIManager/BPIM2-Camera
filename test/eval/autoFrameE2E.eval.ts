import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import type { SongMasterEntry } from "@/lib/songs/types";
import { matchChart } from "@/lib/songs/matcher";
import { findAnchors, fitFrames, type CanonicalLayout, type ScanLine } from "@/lib/vision/autoFrame";
import { GUIDE_KEYS, type GuideLayout } from "@/lib/vision/guides";
import { installCanvasPolyfill, loadBitmap } from "./canvasPolyfill";
import { createNodeEngine } from "./paddleNode";

/**
 * 取り込みの枠の自動推定を、通しで確かめる: pnpm eval autoFrameE2E
 * 全体画像の OCR（fullscan）から枠を置き、その枠で切り出して読んだ結果（曲・EX）が、撮影時の枠で読んだ結果（internal/bench-baseline.json）と同じかを比べる。
 * PAD で、置いた枠を上下左右に広げる割合を変えられる（枠の高さ・幅に対する割合）
 */
const SCAN = process.env.SCAN ?? "internal/fullscan-small-1280.json";
const PAD = Number(process.env.PAD ?? 0);
const MIN = Number(process.env.MIN ?? 2);

const MASTER = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
/** 曲データの曲名との一致度（曲名の行を手がかりにするため） */
const titleScoreOf = (text: string) => matchChart(MASTER, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: text }).candidates[0]?.score ?? 0;

it("autoFrame e2e", async () => {
  installCanvasPolyfill();
  const canon: CanonicalLayout = JSON.parse(readFileSync(process.env.CANON ?? "internal/canon.json", "utf8"));
  const scan: Record<string, { lines: { text: string; confidence: number; x: number; y: number; w: number; h: number }[] }> = JSON.parse(readFileSync(SCAN, "utf8"));
  const baseline: { id: string; ex: number | null; song: string | null }[] = JSON.parse(readFileSync("internal/bench-baseline.json", "utf8"));
  const master: SongMasterEntry[] = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const engine = await createNodeEngine("small");
  const recognizer = new PaddleRecognizer(engine, () => master);
  const t = { n: 0, placed: 0, same: 0, better: 0, worse: 0, differ: 0 };
  const rows: unknown[] = [];
  for (const b of baseline) {
    if (!scan[b.id]) continue;
    t.n++;
    const file = `internal/captures/${b.id}_full.jpg`;
    const m = await sharp(file).metadata();
    const size = { width: m.width!, height: m.height! };
    const lines: ScanLine[] = scan[b.id]!.lines.map((l) => ({ text: l.text, confidence: l.confidence, box: { x: l.x * size.width, y: l.y * size.height, width: l.w * size.width, height: l.h * size.height } }));
    const fit = fitFrames(findAnchors(lines, size, titleScoreOf), canon, size, MIN);
    if (!fit) {
      rows.push({ id: b.id, placed: false });
      continue;
    }
    t.placed++;
    const pad = (r: GuideLayout[keyof GuideLayout]) => {
      const x = Math.max(0, r.x - r.width * PAD), y = Math.max(0, r.y - r.height * PAD);
      return { x, y, width: Math.min(1 - x, r.width * (1 + 2 * PAD)), height: Math.min(1 - y, r.height * (1 + 2 * PAD)) };
    };
    const crops = Object.fromEntries(
      await Promise.all(
        GUIDE_KEYS.map(async (k) => {
          const r = pad(fit.layout[k]);
          const left = Math.round(r.x * size.width), top = Math.round(r.y * size.height);
          const width = Math.max(2, Math.min(size.width - left, Math.round(r.width * size.width))), height = Math.max(2, Math.min(size.height - top, Math.round(r.height * size.height)));
          const buf = await sharp(file).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
          return [k, await loadBitmap(buf)] as const;
        }),
      ),
    );
    let trace: { steps: { song: string | null }[] } | undefined;
    const raw = await recognizer.recognize({ full: crops.score as never, regions: crops as never, onTrace: (x) => (trace = x) });
    const song = trace?.steps.at(-1)?.song ?? null;
    const ex = raw?.exScore.value ?? null;
    const same = ex === b.ex && song === b.song;
    if (same) t.same++;
    else if ((ex !== null && b.ex === null) || (song !== null && b.song === null)) t.better++;
    else if ((ex === null && b.ex !== null) || (song === null && b.song !== null)) t.worse++;
    else t.differ++;
    rows.push({ id: b.id, placed: true, used: fit.used, ex, song, baseEx: b.ex, baseSong: b.song });
    if (!same) console.log(`  ${b.id} used=${fit.used} ex ${b.ex}→${ex} song ${b.song}→${song}`);
  }
  await engine.destroy();
  writeFileSync(`internal/autoframe-e2e-pad${PAD}.json`, JSON.stringify(rows, null, 1));
  console.log(`[autoFrameE2E pad=${PAD} min=${MIN}] n=${t.n} 置けた ${t.placed}: 同じ ${t.same} / 撮影より多く確定 ${t.better} / 撮影より少なく確定 ${t.worse} / 値が違う ${t.differ}`);
}, 3_600_000);
