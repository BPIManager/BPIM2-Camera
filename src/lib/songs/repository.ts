import { getDb } from "@/lib/storage/db";
import type { SongMaster } from "./types";

/** BPIM2 の全難易度（☆1〜12）楽曲マスタ API */
export const MASTER_API_URL = "https://bpi2.poyashi.me/api/v2/songs/master";
/** API に届かないときの同梱データ */
export const MASTER_SEED_URL = `${import.meta.env.BASE_URL}data/songs-master.json`;

interface MasterEnvelope {
  error: boolean;
  body: SongMaster | null;
}

/** 保存済みマスタを返す。無ければ API、それも無理なら同梱シードを使う */
export async function loadMaster(fetchImpl: typeof fetch = fetch): Promise<SongMaster> {
  const db = await getDb();
  const stored = await db.get("master", "current");
  if (stored) return stored;
  try {
    const fetched = await fetchMasterApi(fetchImpl);
    if (fetched) {
      await db.put("master", fetched.master, "current");
      if (fetched.etag) await db.put("meta", fetched.etag, "masterEtag");
      return fetched.master;
    }
  } catch {
    /* オフラインなどはシードで起動する */
  }
  const seed = (await (await fetchImpl(MASTER_SEED_URL)).json()) as SongMaster;
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
  const fetched = await fetchMasterApi(fetchImpl, etag);
  if (!fetched) return false;
  const current = await db.get("master", "current");
  if (current?.version === fetched.master.version) return false;
  await db.put("master", fetched.master, "current");
  if (fetched.etag) await db.put("meta", fetched.etag, "masterEtag");
  return true;
}

/** 304 / 失敗は null */
async function fetchMasterApi(
  fetchImpl: typeof fetch,
  etag?: string,
): Promise<{ master: SongMaster; etag: string | null } | null> {
  const res = await fetchImpl(MASTER_API_URL, { headers: etag ? { "If-None-Match": etag } : {} });
  if (res.status === 304 || !res.ok) return null;
  const env = (await res.json()) as MasterEnvelope;
  if (env.error || !env.body) return null;
  return { master: env.body, etag: res.headers.get("ETag") };
}
