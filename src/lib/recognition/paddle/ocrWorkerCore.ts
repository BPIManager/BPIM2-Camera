/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { PaddleOcrService, type ModelUrls } from "ppu-paddle-ocr/web";
import type { OcrImage, OcrLine } from "./engine";

type Request = { id: number; type: "warmup" } | { id: number; type: "config"; threads: number } | { id: number; type: "read"; image: OcrImage };

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
  function ensure(): Promise<PaddleOcrService> {
    ready ??= (async () => {
      const service = new PaddleOcrService({ model: (await hasLocalModels()) ? models.local : models.fallback });
      await service.initialize();
      return service;
    })();
    return ready;
  }

  self.onmessage = async (event: MessageEvent<Request>) => {
    const msg = event.data;
    // スレッド数は、モデルを読み込む前（最初のメッセージ）に決める。返事はしない
    if (msg.type === "config") {
      ort.env.wasm.numThreads = msg.threads;
      return;
    }
    try {
      const service = await ensure();
      if (msg.type === "warmup") {
        self.postMessage({ id: msg.id, lines: [] });
        return;
      }
      const r = await service.recognize(msg.image instanceof ArrayBuffer ? msg.image : (toCanvas(msg.image) as unknown as ArrayBuffer));
      const lines: OcrLine[] = r.lines.flatMap((row) => row.map((it) => ({ text: it.text, confidence: it.confidence * 100, box: it.box })));
      self.postMessage({ id: msg.id, lines });
    } catch (e) {
      ready = null;
      self.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
    }
  };
}
