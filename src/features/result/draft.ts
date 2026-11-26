import type { OcrTrace } from "@/lib/recognition/recognizer";
import type { RawResult } from "@/lib/domain/types";
import type { Resolution } from "@/lib/recognition/resolve";
import type { GuideKey } from "@/lib/vision/guides";

/** 撮影・取り込み 1 回分の読み取り途中の状態 */
export interface Draft {
  id: string;
  image: Blob;
  source: "camera" | "import";
  /** ガイド枠で切り出したスコア部と曲名帯（カメラ撮影のみ）。学習サンプルの元 */
  regions?: Record<GuideKey, Blob>;
  /** OCR の読み取りの記録（カメラ撮影のみ）。学習サンプルに添えて送る */
  ocr?: OcrTrace;
  raw: RawResult | null;
  resolution: Resolution | null;
}
