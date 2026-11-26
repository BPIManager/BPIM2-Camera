import type { OcrEngine, OcrLine } from "./engine";

type Reply = { id: number; lines?: OcrLine[]; error?: string };

/** PaddleOCR を Worker で動かし、画像バイト列を渡して行を受け取る（メインスレッドを止めない） */
export class WorkerOcrEngine implements OcrEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (l: OcrLine[]) => void; reject: (e: Error) => void }>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./paddle.worker.ts", import.meta.url), { type: "module" });
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
    return w;
  }

  private call(msg: { type: "warmup" } | { type: "read"; image: ArrayBuffer }, transfer: Transferable[] = []): Promise<OcrLine[]> {
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

  readLines(image: ArrayBuffer): Promise<OcrLine[]> {
    return this.call({ type: "read", image }, [image]);
  }
}
