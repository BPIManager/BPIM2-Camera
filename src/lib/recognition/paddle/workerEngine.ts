import type { AssetProgress } from "../assetStore";
import { reportDownload } from "../downloads";
import type { OcrBackend } from "../ocrSetup";
import type { OcrEngine, OcrImage, OcrLine } from "./engine";
import type { OcrExecutionProvider, OcrWorkerConfig } from "./ocrWorkerCore";

type Reply = { id: number; lines?: OcrLine[]; error?: string; provider?: OcrExecutionProvider; progress?: AssetProgress };

/**
 * OCR の Worker を作る。CPU 用は onnxruntime-web の CPU だけの版、GPU 用は WebGPU も使える版（CPU でも読める）。
 * どのモデルを読むか（本読み・自動撮影の下見）は、設定（OcrWorkerConfig）で決める
 */
export const createOcrWorker = (flavor: OcrBackend) => () =>
  flavor === "cpu"
    ? new Worker(new URL("./ocr.cpu.worker.ts", import.meta.url), { type: "module" })
    : new Worker(new URL("./ocr.gpu.worker.ts", import.meta.url), { type: "module" });

/** PaddleOCR を Worker で動かし、画像バイト列を渡して行を受け取る（メインスレッドを止めない） */
export class WorkerOcrEngine implements OcrEngine {
  private worker: Worker | null = null;
  private seq = 0;
  /** 実際に使っている処理（ウォームアップが済むと分かる） */
  provider: OcrExecutionProvider | null = null;
  private pending = new Map<number, { resolve: (l: OcrLine[]) => void; reject: (e: Error) => void }>();

  constructor(
    private readonly createWorker: () => Worker,
    /** WASM のスレッド数（未指定なら onnxruntime の既定。コア数の半分、最大 4）・推論に使うもの・読むモデル */
    private readonly config: OcrWorkerConfig = {},
  ) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    w.onmessage = (e: MessageEvent<Reply>) => {
      // モデル・ランタイムの取得の進み具合（画面に出す）
      if (e.data.progress) {
        reportDownload(e.data.progress);
        return;
      }
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.provider) this.provider = e.data.provider;
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.lines ?? []);
    };
    w.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message));
      this.pending.clear();
      this.worker = null;
    };
    this.worker = w;
    if (Object.keys(this.config).length > 0) w.postMessage({ id: 0, type: "config", ...this.config });
    return w;
  }

  private call(msg: { type: "warmup" } | { type: "read"; image: OcrImage }, transfer: Transferable[] = []): Promise<OcrLine[]> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ensure().postMessage({ id, ...msg }, transfer);
    });
  }

  /** モデルの読み込みを先に済ませておく */
  warmUp(): Promise<unknown> {
    return this.call({ type: "warmup" });
  }

  readLines(image: OcrImage): Promise<OcrLine[]> {
    return this.call({ type: "read", image }, [image instanceof ArrayBuffer ? image : image.data.buffer]);
  }

  /** Worker を止めて、メモリを返す（待っていた呼び出しは失敗にする） */
  dispose() {
    for (const p of this.pending.values()) p.reject(new Error("disposed"));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
