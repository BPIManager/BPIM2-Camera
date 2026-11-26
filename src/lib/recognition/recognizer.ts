import type { RawResult } from "@/lib/domain/types";

/**
 * 1 フレームの画面から値を読む。実装は Worker 内（OffscreenCanvas）で動かす。
 * 画面が検出できなければ null。
 */
export interface Recognizer {
  recognize(frame: ImageBitmap): Promise<RawResult | null>;
}

/** 読み取り器が未導入のときの代替。常に読めなかったとして手入力へ回す */
export class NullRecognizer implements Recognizer {
  async recognize(_frame: ImageBitmap): Promise<RawResult | null> {
    return null;
  }
}
