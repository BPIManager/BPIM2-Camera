import type { RawResult } from "@/lib/domain/types";
import type { GuideKey } from "@/lib/vision/guides";

export interface RecognizeInput {
  /** 撮影した全体画像（履歴・シェア用）。領域がないとき（画像取り込み）はこれ全体を読む */
  full: ImageBitmap;
  /** ガイド枠で切り出したスコア部・曲名帯・DJ LEVEL 行・判定表。カメラ撮影のときだけ渡る */
  regions?: Record<GuideKey, ImageBitmap>;
}

/**
 * 画面から値を読む。実装は Worker 内（OffscreenCanvas）で動かす。
 * 何も読めなければ null。
 */
export interface Recognizer {
  recognize(input: RecognizeInput): Promise<RawResult | null>;
}
