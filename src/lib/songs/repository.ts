import { getDb } from "@/lib/storage/db";
import type { SongMaster } from "./types";

export const MASTER_URL = `${import.meta.env.BASE_URL}data/songs-master.json`;

/** 保存済みマスタを返す。無ければ同梱シードを取り込む */
export async function loadMaster(fetchImpl: typeof fetch = fetch): Promise<SongMaster> {
  const db = await getDb();
  const stored = await db.get("master", "current");
  if (stored) return stored;
  const res = await fetchImpl(MASTER_URL);
  const seed = (await res.json()) as SongMaster;
  await db.put("master", seed, "current");
  return seed;
}

/**
 * 起動時にバックグラウンドで呼ぶ。ETag が変わっていれば差し替える（画面表示は待たせない）。
 * @returns 更新したら true
 */
export async function refreshMaster(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const db = await getDb();
  const etag = (await db.get("meta", "masterEtag")) as string | undefined;
  const res = await fetchImpl(MASTER_URL, { headers: etag ? { "If-None-Match": etag } : {} });
  if (res.status === 304 || !res.ok) return false;
  const next = (await res.json()) as SongMaster;
  const current = await db.get("master", "current");
  if (current?.version === next.version) return false;
  await db.put("master", next, "current");
  const newTag = res.headers.get("ETag");
  if (newTag) await db.put("meta", newTag, "masterEtag");
  return true;
}
