/// <reference lib="webworker" />
import { V6_TINY_MODEL } from "ppu-paddle-ocr/web";
import { startOcrWorker } from "./ocrWorkerCore";

/**
 * 自動撮影の下見用（tiny）。small の 1/5 ほどの大きさで速く、辞書は約 6.9k 字（かなや珍しい漢字は省く）。
 * 「枠に、それらしい文字が入ったか」を見るだけなので、数字と英字が読めれば足りる。
 */
startOcrWorker({
  local: {
    detection: "/models/paddle/PP-OCRv6_tiny_det.ort",
    recognition: "/models/paddle/PP-OCRv6_tiny_rec.ort",
    charactersDictionary: "/models/paddle/ppocrv6_tiny_dict.txt",
  },
  fallback: V6_TINY_MODEL,
});
