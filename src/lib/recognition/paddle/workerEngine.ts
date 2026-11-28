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

/**
 * モデルの読み込みが済んだあとの、読み取り 1 回の待ち時間の上限（ミリ秒）。ふだんは 1 回数秒で終わる。
 * アプリを裏に回したあとなどに Worker が返事をしなくなることがあり（GPU を失う・止められるなど）、待ち続けると「読んでいます」のまま止まるため
 */
export const READ_TIMEOUT_MS = 20_000;

/** 待ち時間の上限を過ぎた */
export class OcrTimeoutError extends Error {
  constructor() {
    super("OCR の応答がありません");
    this.name = "OcrTimeoutError";
  }
}

/** 画像の写し（Worker に渡すと元の画像は使えなくなるので、やり直し用に取っておく） */
const copyImage = (image: OcrImage): OcrImage => (image instanceof ArrayBuffer ? image.slice(0) : new ImageData(new Uint8ClampedArray(image.data), image.width, image.height));

/**
 * PaddleOCR を Worker で動かし、画像バイト列を渡して行を受け取る（メインスレッドを止めない）。
 * モデルの読み込みが済んだあとで、読み取りが上限の時間を過ぎても返らなければ、Worker を作り直して 1 回だけ読み直す
 */
export class WorkerOcrEngine implements OcrEngine {
  private worker: Worker | null = null;
  private seq = 0;
  /** 実際に使っている処理（ウォームアップが済むと分かる） */
  provider: OcrExecutionProvider | null = null;
  /** いまの Worker で、モデルの読み込みが済んでいる（1 回でも返事があった）。済むまでは、取得・読み込みの時間があるので上限を設けない */
  private loaded = false;
  private pending = new Map<number, { resolve: (l: OcrLine[]) => void; reject: (e: Error) => void }>();
  /** 頼んだ時刻（記録用） */
  private sentAt = new Map<number, number>();
  /**
   * 読み取りの順番待ち。Worker は、同時に 2 件を読めない（同じモデルのセッションを同時に使うと、返事が来なくなったり、0 行になったりする）。
   * 使用オプション・クリアランプなど、複数の読み取りが同時に頼まれても、1 件ずつ頼む
   */
  private tail: Promise<unknown> = Promise.resolve();
  /** dispose のたびに増やす。止めたあとに、順番待ちの読み取りが Worker を作り直さないようにする */
  private generation = 0;

  constructor(
    private readonly createWorker: () => Worker,
    /** WASM のスレッド数（未指定なら onnxruntime の既定。コア数の半分、最大 4）・推論に使うもの・読むモデル */
    private readonly config: OcrWorkerConfig = {},
    private readonly timeoutMs: number = READ_TIMEOUT_MS,
    /** 原因を調べるための記録（開発中だけ渡す）。頼んだ・返ってきた・作り直したなど */
    private readonly log: (message: string) => void = () => undefined,
  ) {}

  /** 頼んでから返ってくるまでの時間（記録用） */
  private took(id: number): string {
    const t = this.sentAt.get(id);
    this.sentAt.delete(id);
    return t === undefined ? "" : ` ${Math.round(performance.now() - t)}ms`;
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    this.log("Worker を作成");
    w.onmessage = (e: MessageEvent<Reply>) => {
      // モデル・ランタイムの取得の進み具合（画面に出す）
      if (e.data.progress) {
        reportDownload(e.data.progress);
        return;
      }
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      this.log(`#${e.data.id} 返事${this.took(e.data.id)} ${e.data.error ? `エラー: ${e.data.error}` : `${e.data.lines?.length ?? 0} 行`}${this.loaded ? "" : "（初回）"}`);
      this.loaded = true;
      if (e.data.provider) this.provider = e.data.provider;
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.lines ?? []);
    };
    w.onmessageerror = () => this.log("Worker からのメッセージを受け取れなかった（messageerror）");
    w.onerror = (e) => {
      this.log(`Worker のエラー: ${e.message}（待っていた ${this.pending.size} 件を失敗にする）`);
      for (const p of this.pending.values()) p.reject(new Error(e.message));
      this.pending.clear();
      this.sentAt.clear();
      this.worker = null;
      this.loaded = false;
    };
    this.worker = w;
    if (Object.keys(this.config).length > 0) w.postMessage({ id: 0, type: "config", ...this.config });
    return w;
  }

  private call(msg: { type: "warmup" } | { type: "read"; image: OcrImage }, transfer: Transferable[] = []): Promise<OcrLine[]> {
    const id = ++this.seq;
    // モデルの読み込みが済んでいるときだけ、待ち時間に上限を設ける
    const limited = this.loaded && msg.type === "read";
    return new Promise((resolve, reject) => {
      const timer = limited
        ? setTimeout(() => {
            if (!this.pending.has(id)) return;
            this.log(`#${id} ${this.timeoutMs}ms 返事がない。Worker を作り直す（待っていた ${this.pending.size} 件）`);
            // 返事をしない Worker は捨てる（待っていたほかの読み取りも失敗にする）。次の読み取りで作り直す
            this.restart(new OcrTimeoutError());
          }, this.timeoutMs)
        : undefined;
      this.pending.set(id, {
        resolve: (l) => {
          clearTimeout(timer);
          resolve(l);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.sentAt.set(id, performance.now());
      const size = msg.type === "read" ? (msg.image instanceof ArrayBuffer ? ` ${msg.image.byteLength}B` : ` ${msg.image.width}x${msg.image.height}`) : "";
      this.log(`#${id} ${msg.type}${size} を頼む（待ち ${this.pending.size - 1} 件${limited ? "" : "、上限なし"}）`);
      this.ensure().postMessage({ id, ...msg }, transfer);
    });
  }

  /** Worker を止め、待っていた呼び出しを error で失敗にする */
  private restart(error: Error) {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    this.sentAt.clear();
    this.worker?.terminate();
    this.worker = null;
    this.loaded = false;
    for (const p of waiting) p.reject(error);
  }

  /** モデルの読み込みを先に済ませておく */
  warmUp(): Promise<unknown> {
    return this.call({ type: "warmup" });
  }

  readLines(image: OcrImage): Promise<OcrLine[]> {
    const generation = this.generation;
    const run = () => (generation === this.generation ? this.readNow(image) : Promise.reject(new Error("disposed")));
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async readNow(image: OcrImage): Promise<OcrLine[]> {
    // 上限を設けるとき（モデルの読み込み済み）だけ、読み直し用の写しを取っておく
    const spare = this.loaded ? copyImage(image) : null;
    try {
      return await this.send(image);
    } catch (e) {
      if (!(e instanceof OcrTimeoutError) || !spare) throw e;
      // 作り直した Worker で 1 回だけ読み直す（モデルの読み込みからやり直すので、上限は設けない）
      this.log("作り直した Worker で読み直す");
      return this.send(spare);
    }
  }

  private send(image: OcrImage): Promise<OcrLine[]> {
    return this.call({ type: "read", image }, [image instanceof ArrayBuffer ? image : image.data.buffer]);
  }

  /** Worker を止めて、メモリを返す（待っていた呼び出しは失敗にする） */
  dispose() {
    if (this.worker) this.log("Worker を止める（dispose）");
    this.generation++;
    this.restart(new Error("disposed"));
  }
}
