import { PaddleOcrService, V6_MEDIUM_MODEL, V6_SMALL_MODEL, V6_TINY_MODEL } from "ppu-paddle-ocr";
import type { OcrEngine, OcrLine } from "@/lib/recognition/paddle/engine";

const MODELS = { tiny: V6_TINY_MODEL, small: V6_SMALL_MODEL, medium: V6_MEDIUM_MODEL };

/** 評価用: Node の PaddleOCR を OcrEngine として使う */
export async function createNodeEngine(model: keyof typeof MODELS = "small"): Promise<OcrEngine & { destroy(): Promise<void> }> {
  const s = new PaddleOcrService({ model: MODELS[model], processing: { engine: "canvas-native" } });
  await s.initialize();
  return {
    async readLines(image) {
      const r = await s.recognize(image);
      const out: OcrLine[] = [];
      for (const row of r.lines) for (const it of row) out.push({ text: it.text, confidence: it.confidence * 100, box: it.box });
      return out;
    },
    destroy: () => s.destroy(),
  };
}
