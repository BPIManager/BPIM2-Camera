import { getDb } from "@/lib/storage/db";
import type { BeatSeekerMe } from "./client";

/** 端末に保存した beat-seeker の連携。トークンと、確かめたときの持ち主・権限 */
export interface BeatSeekerLink {
  token: string;
  me: BeatSeekerMe;
  /** 保存した（確かめた）時刻（ms） */
  verifiedAt: number;
}

/** IndexedDB の meta ストアのキー。トークンは端末の外（BPIM2・学習データの送信など）には出さない */
const KEY = "beatSeekerLink";

let cache: BeatSeekerLink | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 保存した連携を読む（なければ null） */
export async function loadBeatSeekerLink(): Promise<BeatSeekerLink | null> {
  if (cache !== undefined) return cache;
  const db = await getDb();
  const v = (await db.get("meta", KEY)) as BeatSeekerLink | undefined;
  cache = v && typeof v.token === "string" ? v : null;
  return cache;
}

export async function saveBeatSeekerLink(link: BeatSeekerLink): Promise<void> {
  const db = await getDb();
  await db.put("meta", link, KEY);
  cache = link;
  emit();
}

export async function clearBeatSeekerLink(): Promise<void> {
  const db = await getDb();
  await db.delete("meta", KEY);
  cache = null;
  emit();
}

/** 保存・解除を知る（オンボーディングと設定で、同じ状態を見るため） */
export function subscribeBeatSeekerLink(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** テスト用。読み込んだ値を捨てる */
export function resetBeatSeekerCacheForTest() {
  cache = undefined;
}
