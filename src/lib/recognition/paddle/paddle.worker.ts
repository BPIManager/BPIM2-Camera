/// <reference lib="webworker" />
import { V6_SMALL_MODEL } from "ppu-paddle-ocr/web";
import { startOcrWorker } from "./ocrWorkerCore";

/** 本読み用（small）。自前配信のモデルは、pnpm models:fetch で public/models/paddle に置く */
startOcrWorker({
  local: {
    detection: "/models/paddle/PP-OCRv6_small_det.ort",
    recognition: "/models/paddle/PP-OCRv6_small_rec.ort",
    charactersDictionary: "/models/paddle/ppocrv6_dict.txt",
  },
  fallback: V6_SMALL_MODEL,
});
