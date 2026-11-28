import { EnginePool } from "./paddle/enginePool";
import { PaddleRecognizer } from "./paddle/paddleRecognizer";
import { createOcrWorker, WorkerOcrEngine } from "./paddle/workerEngine";
import type { Recognizer } from "./recognizer";
import type { OcrEngine } from "./paddle/engine";
import type { SongMasterEntry } from "@/lib/songs/types";
import { logEvent } from "@/lib/debug/ocrLog";

/** 読み取りの処理。gpu は WebGPU、cpu は WASM（マルチスレッド） */
export type OcrBackend = "gpu" | "cpu";

export interface OcrSetup {
  backend: OcrBackend;
  recognizer: Recognizer;
  /** 曲名を読む Worker（取り込んだ画像の全体を読んで、枠の位置を推定するのにも使う） */
  engine: OcrEngine;
  /** モデルの読み込みを済ませておく。実際に使っている処理を返す（GPU を頼んでも、使えなければ CPU になる） */
  warmUp(): Promise<OcrBackend>;
  /** Worker を止めて、メモリを返す */
  dispose(): void;
}

/**
 * 処理の種類に合わせて、Worker と認識器を用意する。
 * - gpu: Worker 1 つ（GPU は 1 回ずつしか読めないので、分けても速くならない）
 * - cpu: 曲名と、スコア欄・判定表を、別々の Worker で同時に読む（実機で約 25% 速い）。スコア欄・判定表は先読みし、要らなくなった分は取り消す
 */
export function createOcrSetup(backend: OcrBackend, getMaster: () => readonly SongMasterEntry[]): OcrSetup {
  const ep = backend === "gpu" ? "webgpu" : "wasm";
  // 開発中は、Worker とのやりとりを記録する（読み取りが止まったときに、どこで止まったかを見るため）
  const log = (name: string) => (import.meta.env.DEV ? (m: string) => logEvent(`ocr:${name}`, m) : undefined);
  const titleWorker = new WorkerOcrEngine(createOcrWorker(backend), { ep }, undefined, log("title"));
  const passWorker = backend === "cpu" ? new WorkerOcrEngine(createOcrWorker(backend), { ep }, undefined, log("pass")) : undefined;
  const workers = passWorker ? [titleWorker, passWorker] : [titleWorker];
  // 撮影も取り込みも、枠で切り出した 3 か所を PaddleOCR で読む
  const recognizer = new PaddleRecognizer(titleWorker, getMaster, {
    passEngine: passWorker && new EnginePool([passWorker]),
    ahead: passWorker ? Number.POSITIVE_INFINITY : 0,
  });
  return {
    backend,
    recognizer,
    engine: titleWorker,
    warmUp: async () => {
      await Promise.all(workers.map((w) => w.warmUp()));
      return titleWorker.provider === "webgpu" ? "gpu" : "cpu";
    },
    dispose: () => {
      for (const w of workers) w.dispose();
    },
  };
}
