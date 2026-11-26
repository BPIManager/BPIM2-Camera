/// <reference lib="webworker" />
import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr/web";
import type { OcrLine } from "./engine";

/** 自前配信のモデル（pnpm models:fetch で public/models/paddle に置く）。なければ既定の取得先を使う */
const LOCAL = {
  detection: "/models/paddle/PP-OCRv6_small_det.ort",
  recognition: "/models/paddle/PP-OCRv6_small_rec.ort",
  charactersDictionary: "/models/paddle/ppocrv6_dict.txt",
};

async function hasLocalModels(): Promise<boolean> {
  try {
    const res = await fetch(LOCAL.detection, { method: "HEAD" });
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

let ready: Promise<PaddleOcrService> | null = null;
function ensure(): Promise<PaddleOcrService> {
  ready ??= (async () => {
    const service = new PaddleOcrService({ model: (await hasLocalModels()) ? LOCAL : V6_SMALL_MODEL });
    await service.initialize();
    return service;
  })();
  return ready;
}

type Request = { id: number; type: "warmup" } | { id: number; type: "read"; image: ArrayBuffer };

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
