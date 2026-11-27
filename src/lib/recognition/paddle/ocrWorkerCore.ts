/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { PaddleOcrService, type ModelUrls } from "ppu-paddle-ocr/web";
import type { OcrImage, OcrLine } from "./engine";
import { hasWebGpu } from "./webgpu";

/** 推論に使うもの。wasm は CPU、webgpu は GPU（onnxruntime-web の WebGPU 版が要る） */
export type OcrExecutionProvider = "wasm" | "webgpu";

type Request = { id: number; type: "warmup" } | { id: number; type: "config"; threads?: number; ep?: OcrExecutionProvider; models?: Partial<ModelUrls> } | { id: number; type: "read"; image: OcrImage };

/**
 * WebGPU は、推論のセッションを 1 つずつしか作れない。ライブラリは検出と認識のセッションを同時に作るので、
 * 作る処理を 1 つずつ順に行うよう包む
 */
function serializeSessionCreation() {
  const proto = PaddleOcrService.prototype as unknown as { _createSession: (m: Uint8Array) => Promise<unknown>; __serial?: boolean };
  if (proto.__serial) return;
  proto.__serial = true;
  const create = proto._createSession;
  let chain: Promise<unknown> = Promise.resolve();
  proto._createSession = function (this: unknown, m: Uint8Array) {
    const next = chain.then(() => create.call(this, m));
    chain = next.catch(() => undefined);
    return next;
  };
}

/** 結果のキャッシュを使わない指定（型に無いので、行ごとの結果を返す呼び方の型に合わせる） */
const NO_CACHE = { noCache: true } as unknown as { flatten?: false };

/** 画素を、OCR が読めるキャンバスにする（PNG の復号を省く） */
function toCanvas(image: ImageData): OffscreenCanvas {
  const c = new OffscreenCanvas(image.width, image.height);
  c.getContext("2d")!.putImageData(image, 0, 0);
  return c;
}

/**
 * OCR を動かす Worker の本体。モデルだけ差し替えて、small（本読み）と tiny（自動撮影の下見）で共用する。
 * local は自前配信のモデル（pnpm models:fetch で public/models/paddle に置く）。なければ fallback の取得先を使う。
 */
export function startOcrWorker(models: { local: ModelUrls; fallback: ModelUrls }) {
  async function hasLocalModels(): Promise<boolean> {
    try {
      const res = await fetch(models.local.detection, { method: "HEAD" });
      return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
    } catch {
      return false;
    }
  }

  let ready: Promise<PaddleOcrService> | null = null;
  /**
   * 未指定なら、WebGPU が使えれば WebGPU、なければ WASM。ライブラリの既定は CPU に固定されているので、ここで選ぶ。
   * WebGPU でセッションを作れなければ、ライブラリが CPU に切り替える
   */
  let backend: OcrExecutionProvider | null = null;
  /** モデルの取得先の差し替え（ベンチマークで、WebGPU 用の ONNX 形式を試すため） */
  let override: Partial<ModelUrls> = {};
  function ensure(): Promise<PaddleOcrService> {
    ready ??= (async () => {
      const service = new PaddleOcrService({
        model: { ...((await hasLocalModels()) ? models.local : models.fallback), ...override },
        session: { executionProviders: [backend ?? ((await hasWebGpu()) ? "webgpu" : "wasm")] },
      });
      await service.initialize();
      return service;
    })();
    return ready;
  }

  // WebGPU を使うとき（明示・既定のどちらでも）に備え、セッションは 1 つずつ作る（WASM でも害はない）
  serializeSessionCreation();

  self.onmessage = async (event: MessageEvent<Request>) => {
    const msg = event.data;
    // スレッド数は、モデルを読み込む前（最初のメッセージ）に決める。返事はしない
    if (msg.type === "config") {
      if (msg.threads) ort.env.wasm.numThreads = msg.threads;
      if (msg.ep) backend = msg.ep;
      if (msg.models) override = msg.models;

      return;
    }
    try {
      const service = await ensure();
      if (msg.type === "warmup") {
        // 実際に使っている処理を返す（WebGPU でセッションを作れなければ、ライブラリが CPU に切り替えている）
        const used = (service as unknown as { options?: { session?: { executionProviders?: unknown[] } } }).options?.session?.executionProviders?.[0];
        self.postMessage({ id: msg.id, lines: [], provider: used === "webgpu" ? "webgpu" : "wasm" });
        return;
      }
      // ライブラリの結果のキャッシュは使わない（同じ画像を読み直すベンチマークで、測れなくなるため。読み取りは決定的なので、結果は変わらない）
      const r = await service.recognize(msg.image instanceof ArrayBuffer ? msg.image : (toCanvas(msg.image) as unknown as ArrayBuffer), NO_CACHE);
      const lines: OcrLine[] = r.lines.flatMap((row) => row.map((it) => ({ text: it.text, confidence: it.confidence * 100, box: it.box })));
      self.postMessage({ id: msg.id, lines });
    } catch (e) {
      ready = null;
      self.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
    }
  };
}
