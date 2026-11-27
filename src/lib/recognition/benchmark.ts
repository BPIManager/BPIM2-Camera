import type { SongMasterEntry } from "@/lib/songs/types";
import { createOcrSetup, type OcrBackend } from "./ocrSetup";
import { hasWebGpu } from "./paddle/webgpu";

/** ベンチマークの結果。読み取り 1 回の時間（ms・中央値）。GPU が使えない端末では gpuMs は null */
export interface OcrBenchmarkResult {
  cpuMs: number;
  gpuMs: number | null;
  /** 速かったほう */
  best: OcrBackend;
  at: number;
}

export type BenchmarkProgress =
  | { phase: "prepare"; backend: OcrBackend }
  | { phase: "read"; backend: OcrBackend; run: number; runs: number }
  | { phase: "done"; result: OcrBenchmarkResult };

/** 測る回数（この前に 1 回、慣らしで読む。GPU は初回にシェーダーを作るので、慣らしは測らない） */
const RUNS = 2;
const SAMPLE = ["score", "title", "judge"] as const;

// ベンチマーク中は、アプリの OCR の Worker を止める（スマホで、モデルを何組もメモリに載せないため）
let running = false;
const listeners = new Set<() => void>();
export const isBenchmarkRunning = () => running;
export function subscribeBenchmark(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function setRunning(v: boolean) {
  running = v;
  for (const l of listeners) l();
}

async function loadSample(): Promise<Record<(typeof SAMPLE)[number], ImageBitmap>> {
  const entries = await Promise.all(
    SAMPLE.map(async (k) => {
      const res = await fetch(`/bench/sample-${k}.jpg`);
      if (!res.ok) throw new Error(`サンプル画像を取得できません（${res.status}）`);
      return [k, await createImageBitmap(await res.blob())] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof SAMPLE)[number], ImageBitmap>;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** 1 つの処理で、同梱のサンプル画像（リザルト画面の 3 か所）を読んで時間を測る */
async function measure(backend: OcrBackend, getMaster: () => readonly SongMasterEntry[], onProgress: (p: BenchmarkProgress) => void, signal?: AbortSignal): Promise<number> {
  onProgress({ phase: "prepare", backend });
  const setup = createOcrSetup(backend, getMaster);
  const regions = await loadSample();
  try {
    const used = await setup.warmUp();
    if (used !== backend) throw new Error(`${backend} を使えませんでした`);
    const times: number[] = [];
    for (let i = 0; i <= RUNS; i++) {
      signal?.throwIfAborted();
      if (i > 0) onProgress({ phase: "read", backend, run: i, runs: RUNS });
      const t = performance.now();
      await setup.recognizer.recognize({ full: regions.score, regions, signal });
      if (i > 0) times.push(performance.now() - t);
    }
    return Math.round(median(times));
  } finally {
    setup.dispose();
    for (const b of Object.values(regions)) b.close();
  }
}

/**
 * 端末で、CPU と（使えれば）GPU の読み取りの速さを測り、速いほうを返す。
 * 初回はモデルの取得も含むので、時間がかかる。測っている間は、アプリの OCR の Worker を止める
 */
export async function runOcrBenchmark(getMaster: () => readonly SongMasterEntry[], onProgress: (p: BenchmarkProgress) => void = () => undefined, signal?: AbortSignal): Promise<OcrBenchmarkResult> {
  setRunning(true);
  try {
    const cpuMs = await measure("cpu", getMaster, onProgress, signal);
    // GPU で失敗したら（ドライバの不具合など）、GPU は使えないものとする
    const gpuMs = (await hasWebGpu()) ? await measure("gpu", getMaster, onProgress, signal).catch((e: unknown) => {
      if (signal?.aborted) throw e;
      return null;
    }) : null;
    const result: OcrBenchmarkResult = { cpuMs, gpuMs, best: gpuMs !== null && gpuMs < cpuMs ? "gpu" : "cpu", at: Date.now() };
    onProgress({ phase: "done", result });
    return result;
  } finally {
    setRunning(false);
  }
}
