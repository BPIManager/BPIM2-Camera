import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { PaddleOcrService, V6_SMALL_MODEL, V6_TINY_MODEL } from "ppu-paddle-ocr";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import type { OcrEngine, OcrLine } from "@/lib/recognition/paddle/engine";
import type { OcrTrace } from "@/lib/recognition/recognizer";
import type { SongMasterEntry } from "@/lib/songs/types";
import { installCanvasPolyfill, loadBitmap } from "./canvasPolyfill";
import { toNodeInput } from "./paddleNode";

/**
 * 読み取りの速さのベンチマーク: pnpm eval speed
 * internal/captures の切り出し画像（撮影時に保存したもの）を、実際の認識器（PaddleRecognizer）で読み、
 * 段階ごとの時間と、1 回の OCR の内訳（符号化・復号・検出・認識）を測る。結果は internal/bench-<LABEL>.json。
 * Node（onnxruntime-node）はスマホの WASM より数倍速いので、絶対値ではなく、内訳と比率を見る。
 */
const DIR = "internal/captures";
const LABEL = process.env.LABEL ?? "baseline";
const LIMIT = Number(process.env.LIMIT ?? 0);
/** スマホの WASM（4 スレッド）に近づけるため、スレッド数を絞る */
const THREADS = Number(process.env.THREADS ?? 4);

interface Timing {
  calls: number;
  encode: number;
  decode: number;
  detect: number;
  recognize: number;
}

async function createTimedEngine(model: "small" | "tiny", timing: Timing): Promise<OcrEngine & { destroy(): Promise<void> }> {
  const s = new PaddleOcrService({
    model: model === "small" ? V6_SMALL_MODEL : V6_TINY_MODEL,
    processing: { engine: "canvas-native" },
    session: { intraOpNumThreads: THREADS, interOpNumThreads: 1 },
  });
  await s.initialize();
  const svc = s as unknown as {
    detector: { run: (...a: unknown[]) => Promise<unknown> };
    recognitor: { run: (...a: unknown[]) => Promise<unknown> };
    platform: { canvas: { prepareCanvas: (...a: unknown[]) => Promise<unknown> } };
  };
  const wrap = <T extends object>(o: T, key: keyof T, slot: keyof Timing) => {
    const fn = (o[key] as (...a: unknown[]) => Promise<unknown>).bind(o);
    (o as Record<keyof T, unknown>)[key] = async (...a: unknown[]) => {
      const t = performance.now();
      try {
        return await fn(...a);
      } finally {
        timing[slot] += performance.now() - t;
      }
    };
  };
  wrap(svc.detector, "run", "detect");
  wrap(svc.recognitor, "run", "recognize");
  wrap(svc.platform.canvas, "prepareCanvas", "decode");
  return {
    async readLines(image) {
      timing.calls++;
      const r = (await s.recognize(toNodeInput(image) as ArrayBuffer, { noCache: true } as never)) as unknown as { lines: { text: string; confidence: number; box: OcrLine["box"] }[][] };
      const out: OcrLine[] = [];
      for (const row of r.lines) for (const it of row) out.push({ text: it.text, confidence: it.confidence * 100, box: it.box });
      return out;
    },
    destroy: () => s.destroy(),
  };
}

it("speed", async () => {
  installCanvasPolyfill();
  // 符号化（PNG）の時間: OffscreenCanvas.convertToBlob を包んで測る
  const timing: Timing = { calls: 0, encode: 0, decode: 0, detect: 0, recognize: 0 };
  const OC = (globalThis as unknown as { OffscreenCanvas: { prototype: { convertToBlob: (...a: unknown[]) => Promise<unknown> } } }).OffscreenCanvas;
  const toBlob = OC.prototype.convertToBlob;
  OC.prototype.convertToBlob = async function (this: unknown, ...a: unknown[]) {
    const t = performance.now();
    try {
      return await toBlob.apply(this, a);
    } finally {
      timing.encode += performance.now() - t;
    }
  };

  const master: SongMasterEntry[] = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const engine = await createTimedEngine("small", timing);
  const recognizer = new PaddleRecognizer(engine, () => master);
  // 1 回目はモデルの準備で遅いので、捨てる
  const warm = readFileSync(path.join(DIR, readdirSync(DIR).find((f) => f.endsWith("_score.jpg"))!));
  await engine.readLines(warm.buffer.slice(warm.byteOffset, warm.byteOffset + warm.byteLength) as ArrayBuffer);

  let ids = readdirSync(DIR)
    .filter((f) => f.endsWith("_score.jpg"))
    .map((f) => f.slice(0, -"_score.jpg".length))
    .sort();
  if (LIMIT) ids = ids.slice(0, LIMIT);
  const rows: { id: string; ms: number; song: string | null; ex: number | null; steps: OcrTrace["steps"]; resolvedAt: OcrTrace["resolvedAt"]; timing: Timing }[] = [];
  for (const id of ids) {
    const regions = {
      score: await loadBitmap(path.join(DIR, `${id}_score.jpg`)),
      title: await loadBitmap(path.join(DIR, `${id}_title.jpg`)),
      judge: await loadBitmap(path.join(DIR, `${id}_judge.jpg`)),
    };
    for (const k of Object.keys(timing) as (keyof Timing)[]) timing[k] = 0;
    let trace: OcrTrace | undefined;
    const t0 = performance.now();
    const raw = await recognizer.recognize({ full: regions.score as never, regions: regions as never, onTrace: (t) => (trace = t) });
    const ms = performance.now() - t0;
    const song = trace?.steps.at(-1)?.song ?? null;
    rows.push({ id, ms: Math.round(ms), song, ex: raw?.exScore.value ?? null, steps: trace?.steps ?? [], resolvedAt: trace?.resolvedAt ?? { song: null, ex: null }, timing: { ...timing } });
    console.log(`${id} ${Math.round(ms)}ms calls=${timing.calls} enc=${Math.round(timing.encode)} dec=${Math.round(timing.decode)} det=${Math.round(timing.detect)} rec=${Math.round(timing.recognize)} ex=${raw?.exScore.value ?? "-"} song=${song ?? "-"} steps=${trace?.steps.map((s) => s.step).join(",")}`);
  }
  await engine.destroy();
  writeFileSync(`internal/bench-${LABEL}.json`, JSON.stringify(rows, null, 1));

  // 集計
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const n = rows.length;
  console.log(`\n[${LABEL}] n=${n} 平均 ${Math.round(sum((r) => r.ms) / n)}ms  OCR 呼び出し 平均 ${(sum((r) => r.timing.calls) / n).toFixed(2)} 回`);
  console.log(`  内訳（平均 ms）: 符号化 ${Math.round(sum((r) => r.timing.encode) / n)} / 復号 ${Math.round(sum((r) => r.timing.decode) / n)} / 検出 ${Math.round(sum((r) => r.timing.detect) / n)} / 認識 ${Math.round(sum((r) => r.timing.recognize) / n)}`);
  console.log(`  EX 確定 ${rows.filter((r) => r.ex !== null).length}/${n}  曲 確定 ${rows.filter((r) => r.song !== null).length}/${n}`);
  // 段階ごとの実行回数と、1 回あたりの時間
  const per = new Map<string, { n: number; ms: number }>();
  for (const r of rows) {
    let prev = 0;
    for (const s of r.steps) {
      const key = s.step;
      const e = per.get(key) ?? { n: 0, ms: 0 };
      e.n++;
      e.ms += s.ms - prev;
      prev = s.ms;
      per.set(key, e);
    }
  }
  for (const [k, v] of [...per].sort((a, b) => b[1].ms - a[1].ms)) console.log(`  ${k.padEnd(24)} 実行 ${String(v.n).padStart(3)} 回  1 回 ${Math.round(v.ms / v.n)}ms  合計 ${Math.round(v.ms)}ms`);
  // 確定した段階の分布
  const at = new Map<string, number>();
  for (const r of rows) at.set(`song@${r.resolvedAt.song}`, (at.get(`song@${r.resolvedAt.song}`) ?? 0) + 1);
  for (const r of rows) at.set(`ex@${r.resolvedAt.ex}`, (at.get(`ex@${r.resolvedAt.ex}`) ?? 0) + 1);
  console.log("  " + [...at].sort().map(([k, v]) => `${k}=${v}`).join("  "));
}, 3_600_000);
