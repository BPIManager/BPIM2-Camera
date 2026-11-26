import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ChartRef, ResultRecord } from "@/lib/domain/types";
import type { SongMaster } from "@/lib/songs/types";

/** 読み取り精度の改善に使う学習サンプル。ユーザーが確認・修正した最終値が正解ラベル */
export interface TrainingSample {
  id: string;
  createdAt: number;
  playSide: "1P" | "2P";
  chart: ChartRef;
  /** ユーザーが確定した EX スコア（正解ラベル） */
  exScore: number;
  /** 確認操作なし（自動確定のまま）で保存したか */
  autoConfirmed: boolean;
  /** 手で直した項目（song / exScore）。直す前の読み取りが誤りだった印 */
  correctedFields: string[];
  scoreCrop: Blob;
  titleCrop: Blob;
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
