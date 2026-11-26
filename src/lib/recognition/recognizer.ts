import type { RawResult } from "@/lib/domain/types";

export interface RecognizeInput {
  /** 撮影した全体画像（履歴・シェア用）。領域がないとき（画像取り込み）はこれ全体を読む */
  full: ImageBitmap;
  /** ガイド枠で切り出したスコア部と曲名帯。カメラ撮影のときだけ渡る */
  regions?: { score: ImageBitmap; title: ImageBitmap };
}

/**
 * 画面から値を読む。実装は Worker 内（OffscreenCanvas）で動かす。
 * 何も読めなければ null。
 */
export interface Recognizer {
  recognize(input: RecognizeInput): Promise<RawResult | null>;
}
