/// <reference lib="webworker" />
import { PaddleOcrService, type ModelUrls } from "ppu-paddle-ocr/web";
import type { OcrLine } from "./engine";

type Request = { id: number; type: "warmup" } | { id: number; type: "read"; image: ArrayBuffer };

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
    try {
      const service = await ensure();
      if (msg.type === "warmup") {
        self.postMessage({ id: msg.id, lines: [] });
        return;
      }
      const r = await service.recognize(msg.image);
      const lines: OcrLine[] = r.lines.flatMap((row) => row.map((it) => ({ text: it.text, confidence: it.confidence * 100, box: it.box })));
      self.postMessage({ id: msg.id, lines });
    } catch (e) {
      ready = null;
      self.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
    }
  };
}
