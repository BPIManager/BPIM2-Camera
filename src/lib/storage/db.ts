import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ResultRecord } from "@/lib/domain/types";
import type { SongMaster } from "@/lib/songs/types";

interface CameraDB extends DBSchema {
  history: { key: string; value: ResultRecord; indexes: { "by-date": number } };
  /** 元画像（履歴と同じ id）。統計送信のキュー用に別ストアにする */
  images: { key: string; value: Blob };
  /** OCR 結果の曲名 → 曲 ID。ユーザー修正を次回の照合に使う */
  aliases: { key: string; value: { text: string; songId: number } };
  meta: { key: string; value: unknown };
  master: { key: string; value: SongMaster };
}

export type CameraDb = IDBPDatabase<CameraDB>;

let dbPromise: Promise<CameraDb> | null = null;

export function getDb(name = "bpim2-camera"): Promise<CameraDb> {
  dbPromise ??= openDB<CameraDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore("history", { keyPath: "id" }).createIndex("by-date", "createdAt");
      db.createObjectStore("images");
      db.createObjectStore("aliases", { keyPath: "text" });
      db.createObjectStore("meta");
      db.createObjectStore("master");
    },
  });
  return dbPromise;
}

/** テスト用。接続を捨てて別 DB を開き直せるようにする */
export function resetDbForTest() {
  dbPromise = null;
}
