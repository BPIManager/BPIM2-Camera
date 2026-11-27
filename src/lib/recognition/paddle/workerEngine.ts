import type { OcrEngine, OcrImage, OcrLine } from "./engine";
import type { OcrBackend } from "./ocrWorkerCore";

type Reply = { id: number; lines?: OcrLine[]; error?: string };

/** 本読み用（small）の Worker */
export const createSmallWorker = () => new Worker(new URL("./paddle.worker.ts", import.meta.url), { type: "module" });

/** 自動撮影の下見用（tiny）の Worker */
export const createTinyWorker = () => new Worker(new URL("./tiny.worker.ts", import.meta.url), { type: "module" });

/** PaddleOCR を Worker で動かし、画像バイト列を渡して行を受け取る（メインスレッドを止めない） */
export class WorkerOcrEngine implements OcrEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (l: OcrLine[]) => void; reject: (e: Error) => void }>();

  constructor(
    private readonly createWorker: () => Worker = createSmallWorker,
    /** WASM のスレッド数（未指定なら onnxruntime の既定。コア数の半分、最大 4）と、推論に使うもの */
    private readonly config: { threads?: number; ep?: OcrBackend; models?: { detection?: string; recognition?: string } } = {},
  ) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    w.onmessage = (e: MessageEvent<Reply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
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
