/// <reference lib="webworker" />
const HF = "https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main";
import { startOcrWorker } from "./ocrWorkerCore";

/**
 * 本読み用（small）。自前配信のモデルは、pnpm models:fetch で public/models/paddle に置く。
 * WebGPU でも読めるよう、ONNX 形式を使う（.ort は CPU 向けに最適化済みで、WebGPU では読めない）
 */
startOcrWorker({
  local: {
    detection: "/models/paddle/PP-OCRv6_small_det.onnx",
    recognition: "/models/paddle/PP-OCRv6_small_rec.onnx",
    charactersDictionary: "/models/paddle/ppocrv6_dict.txt",
  },
  fallback: {
    detection: `${HF}/detection/PP-OCRv6_small_det.onnx`,
    recognition: `${HF}/recognition/PP-OCRv6_small_rec.onnx`,
    charactersDictionary: `${HF}/recognition/ppocrv6_dict.txt`,
  },
});
