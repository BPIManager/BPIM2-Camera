/** OCR が返す 1 行（検出した文字の塊）。位置は入力画像の画素 */
export interface OcrLine {
  text: string;
  /** 0〜100 */
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  /** 読んだ画像の大きさ（画素）。記録で位置を 0〜1 の割合にするために、認識器が付ける（エンジンは付けない） */
  size?: { width: number; height: number };
}

/**
 * 画像（PNG などで符号化した ArrayBuffer）から文字の行を読む器。
 * ブラウザでは Worker 内の PaddleOCR、評価（Node）では onnxruntime-node の PaddleOCR を差し込む。
 */
export interface OcrEngine {
  readLines(image: ArrayBuffer): Promise<OcrLine[]>;
}
