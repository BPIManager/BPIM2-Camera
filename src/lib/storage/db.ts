import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ChartRef, ResultRecord } from "@/lib/domain/types";
import type { OcrTrace } from "@/lib/recognition/recognizer";
import type { SongMaster } from "@/lib/songs/types";

/** 読み取り精度の改善に使う学習サンプル。ユーザーが確認・修正した最終値が正解ラベル */
export interface TrainingSample {
  id: string;
  createdAt: number;
  playSide: "1P" | "2P";
  /** ユーザーが確定した譜面（正解ラベル）。まだ確定していない（読み取っただけの）サンプルは null */
  chart: ChartRef | null;
  /** ユーザーが確定した EX スコア（正解ラベル）。まだ確定していなければ null */
  exScore: number | null;
  /** ユーザーが結果を確定したか。読み取りが終わった時点で貯めたものは false。古いサンプルにはない（確定済みとみなす） */
  confirmed?: boolean;
  /** 内容を変えるたびに増やす番号。送信中に確定された場合に、送信済みの印を誤って付けないため */
  rev?: number;
  /** 確認操作なし（自動確定のまま）で保存したか */
  autoConfirmed: boolean;
  /** 手で直した項目（song / exScore）。直す前の読み取りが誤りだった印 */
  correctedFields: string[];
  scoreCrop: Blob;
  titleCrop: Blob;
  /** 判定表の切り出し（PG/GR の学習に使う）。古いサンプルにはない */
  judgeCrop?: Blob;
  /** パネルの中のほかの欄の切り出し（使用オプション・FAST/SLOW・ミスカウントの読み取りの学習に使う）。写っていなければない */
  extraCrops?: { useOption?: Blob; fastSlow?: Blob; missCount?: Blob };
  /** 撮影した写真の全体（縮小し、EXIF を落とした JPEG）。FAST/SLOW などの学習に使う。古いサンプルにはない */
  fullImage?: Blob;
  /** 写真の全体を送り終えたか。大きいので、送れたら端末からは消し（fullImage をなくし）、この印だけ残す */
  fullImageUploaded?: boolean;
  /** ユーザーが確定した、使用オプション・ミスカウント・FAST・SLOW（正解ラベル。分からなければ null） */
  useOption?: string | null;
  missCount?: number | null;
  fast?: number | null;
  slow?: number | null;
  /** サーバーへ送り終えた時刻（ms）。未送信は undefined */
  uploadedAt?: number;
  /** 送信済みのとき、画像も送ったか。画像なし（labels だけ）で送ったあとに、設定で画像を含めるようにしたら、送り直す */
  uploadedWithImage?: boolean;
  /** OCR の読み取りの記録（読んだ文字と確度・確定した結果）。古いサンプルにはない */
  ocr?: OcrTrace;
}

interface CameraDB extends DBSchema {
  history: { key: string; value: ResultRecord; indexes: { "by-date": number } };
  /** 元画像（履歴と同じ id）。統計送信のキュー用に別ストアにする */
  images: { key: string; value: Blob };
  /** OCR 結果の曲名 → 曲 ID。ユーザー修正を次回の照合に使う */
  aliases: { key: string; value: { text: string; songId: number } };
  meta: { key: string; value: unknown };
  master: { key: string; value: SongMaster };
  samples: { key: string; value: TrainingSample; indexes: { "by-date": number } };
}

export type CameraDb = IDBPDatabase<CameraDB>;

let dbPromise: Promise<CameraDb> | null = null;

export function getDb(name = "bpim2-camera"): Promise<CameraDb> {
  dbPromise ??= openDB<CameraDB>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("history", { keyPath: "id" }).createIndex("by-date", "createdAt");
        db.createObjectStore("images");
        db.createObjectStore("aliases", { keyPath: "text" });
        db.createObjectStore("meta");
        db.createObjectStore("master");
      }
      if (oldVersion < 2) {
        db.createObjectStore("samples", { keyPath: "id" }).createIndex("by-date", "createdAt");
      }
    },
  });
  return dbPromise;
}

/** テスト用。接続を捨てて別 DB を開き直せるようにする */
export function resetDbForTest() {
  dbPromise = null;
}
