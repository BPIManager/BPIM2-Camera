import type { RawResult } from "@/lib/domain/types";
import type { GuideKey } from "@/lib/vision/guides";

/** 読み取りの途中でわかった、曲の確定状況（画面の進行表示用） */
export type SongProgress = { kind: "resolved"; title: string } | { kind: "unresolved" };

/** OCR の読み取りの記録。読んだ文字と確度（括弧内）、確定した結果。精度の改善と、デバッグ表示に使う */
export interface OcrTrace {
  title: string[];
  score: string[][];
  judge: string[];
  /** 認識の結果（曲名・譜面・EX など）。読めなければ null */
  result: unknown;
  ms: number;
  /** 読み取りの各段階。どの段階で曲・EX が確定したか（`resolvedAt`）と、段階ごとの経過を残す */
  steps: OcrStep[];
  resolvedAt: { song: string | null; ex: string | null };
}

/** 読み取りの 1 段階（1 回の OCR）。この段階が終わった時点の状態 */
export interface OcrStep {
  /** 段階の名前（例: title:gray1200・title:deskew:raw900・score:cyanFill700・judge:1200） */
  step: string;
  /** この段階で読んだ行の数（行は title・score・judge の配列に、読んだ順に並ぶ） */
  lines: number;
  /** この段階が終わった時点の経過時間（ms） */
  ms: number;
  /** この時点で曲が確定していたら、その曲名 */
  song: string | null;
  /** この時点で EX が確定していたら、その値 */
  ex: number | null;
}

export interface RecognizeInput {
  /** 撮影・取り込んだ全体画像（履歴・シェア用） */
  full: ImageBitmap;
  /** ガイド枠で切り出したスコア部・曲名帯・判定表（撮影も取り込みも、枠で切り出して渡す） */
  regions?: Record<GuideKey, ImageBitmap>;
  /** いま何をしているか（画面の進行表示用）。段階が変わるたびに呼ばれる */
  onStage?: (label: string) => void;
  /** 曲が確定したとき・曲名の読み取りを尽くしても確定できなかったときに呼ばれる。あとで確定したら、もう一度呼ばれる */
  onSong?: (song: SongProgress) => void;
  /** 読み取りが終わったとき、その記録を渡す（結果の確定・修正のあと、学習サンプルに添えるため） */
  onTrace?: (trace: OcrTrace) => void;
  /** 中止の合図。段階の切れ目（OCR の 1 回が終わるごと）で確かめ、中止されていれば打ち切る */
  signal?: AbortSignal;
}

/**
 * 画面から値を読む。実装は Worker 内（OffscreenCanvas）で動かす。
 * 何も読めなければ null。
 */
export interface Recognizer {
  recognize(input: RecognizeInput): Promise<RawResult | null>;
}
