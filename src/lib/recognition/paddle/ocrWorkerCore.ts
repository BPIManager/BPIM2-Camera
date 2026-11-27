/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { PaddleOcrService } from "ppu-paddle-ocr/web";
import { resolveModelFiles, type ModelFiles, type ModelSet } from "../assets";
import { loadAsset, type AssetProgress } from "../assetStore";
import type { OcrImage, OcrLine } from "./engine";
import { hasWebGpu } from "./webgpu";

/** 推論に使うもの。wasm は CPU、webgpu は GPU（WebGPU も使える版の Worker でだけ使える） */
export type OcrExecutionProvider = "wasm" | "webgpu";

/** Worker の設定。最初のメッセージで送る（モデルを読み込む前に決める） */
export interface OcrWorkerConfig {
  threads?: number;
  ep?: OcrExecutionProvider;
  /** 読むモデルの組。既定は small */
  models?: ModelSet;
  /** モデルの取得先の差し替え（ベンチマーク用） */
  modelUrls?: Partial<ModelFiles>;
}

type Request = { id: number; type: "warmup" } | ({ id: number; type: "config" } & OcrWorkerConfig) | { id: number; type: "read"; image: OcrImage };

/** 結果のキャッシュを使わない指定（型に無いので、行ごとの結果を返す呼び方の型に合わせる） */
const NO_CACHE = { noCache: true } as unknown as { flatten?: false };

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

/** 画素を、OCR が読めるキャンバスにする（PNG の復号を省く） */
function toCanvas(image: ImageData): OffscreenCanvas {
  const c = new OffscreenCanvas(image.width, image.height);
  c.getContext("2d")!.putImageData(image, 0, 0);
  return c;
}

/**
 * OCR を動かす Worker の本体。ランタイム（WASM）の URL だけ違えて、CPU 用・GPU 用の Worker で共用する。
 * ランタイムとモデルは、アプリのキャッシュから読み、なければ取得する（取得の進み具合をページに知らせる）
 */
export function startOcrWorker(runtimeUrl: string) {
  let config: OcrWorkerConfig = {};
  let ready: Promise<PaddleOcrService> | null = null;
  const report = (progress: AssetProgress) => self.postMessage({ id: 0, progress });

  function ensure(): Promise<PaddleOcrService> {
    ready ??= (async () => {
      const set = config.models ?? "small";
      const urls = { ...(await resolveModelFiles(set)), ...config.modelUrls };
      // ランタイムとモデルを、キャッシュから（なければ取得して）読む
      const [wasm, detection, recognition, charactersDictionary] = await Promise.all([runtimeUrl, urls.detection, urls.recognition, urls.charactersDictionary].map((u) => loadAsset(u, report)));
      ort.env.wasm.wasmBinary = wasm;
      // 未指定なら、WebGPU が使えれば WebGPU。ライブラリの既定は CPU に固定されているので、ここで選ぶ。
      // WebGPU でセッションを作れなければ、ライブラリが CPU に切り替える
      const ep = config.ep ?? ((await hasWebGpu()) ? "webgpu" : "wasm");
      const service = new PaddleOcrService({ model: { detection, recognition, charactersDictionary }, session: { executionProviders: [ep] } });
      await service.initialize();
      return service;
    })();
    return ready;
  }

  // WebGPU を使うときに備え、セッションは 1 つずつ作る（WASM でも害はない）
  serializeSessionCreation();

  self.onmessage = async (event: MessageEvent<Request>) => {
    const msg = event.data;
    // 設定は、モデルを読み込む前（最初のメッセージ）に決める。返事はしない
    if (msg.type === "config") {
      const { id: _id, type: _type, ...rest } = msg;
      config = rest;
      if (rest.threads) ort.env.wasm.numThreads = rest.threads;
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
