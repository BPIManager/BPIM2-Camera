import { PaddleOcrService, V6_MEDIUM_MODEL, V6_SMALL_MODEL, V6_TINY_MODEL } from "ppu-paddle-ocr";
import { createCanvas, ImageData as NapiImageData } from "@napi-rs/canvas";
import type { OcrEngine, OcrImage, OcrLine } from "@/lib/recognition/paddle/engine";

/** 画素で渡されたときは、キャンバスに描いて渡す */
export function toNodeInput(image: OcrImage) {
  if (image instanceof ArrayBuffer) return image;
  const c = createCanvas(image.width, image.height);
  c.getContext("2d").putImageData(new NapiImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return c;
}

const MODELS = { tiny: V6_TINY_MODEL, small: V6_SMALL_MODEL, medium: V6_MEDIUM_MODEL };

/** 評価用: Node の PaddleOCR を OcrEngine として使う */
export async function createNodeEngine(model: keyof typeof MODELS = "small"): Promise<OcrEngine & { destroy(): Promise<void> }> {
  const s = new PaddleOcrService({ model: MODELS[model], processing: { engine: "canvas-native" } });
  await s.initialize();
  return {
    async readLines(image) {
      const r = await s.recognize(toNodeInput(image));
      const out: OcrLine[] = [];
      for (const row of r.lines) for (const it of row) out.push({ text: it.text, confidence: it.confidence * 100, box: it.box });
      return out;
    },
    destroy: () => s.destroy(),
  };
}
