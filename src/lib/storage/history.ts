import type { ResultRecord } from "@/lib/domain/types";
import { getDb } from "./db";

export async function saveResult(record: ResultRecord, image?: Blob): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["history", "images"], "readwrite");
  await tx.objectStore("history").put(record);
  if (image) await tx.objectStore("images").put(image, record.id);
  await tx.done;
}

/** 新しい順 */
export async function listResults(): Promise<ResultRecord[]> {
  const db = await getDb();
  return (await db.getAllFromIndex("history", "by-date")).reverse();
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return (await getDb()).get("images", id);
}

export async function deleteResult(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["history", "images"], "readwrite");
  await tx.objectStore("history").delete(id);
  await tx.objectStore("images").delete(id);
  await tx.done;
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["history", "images"], "readwrite");
  await tx.objectStore("history").clear();
  await tx.objectStore("images").clear();
  await tx.done;
}

export function filterResults(records: readonly ResultRecord[], query: string): ResultRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...records];
  return records.filter((r) => r.chart.title.toLowerCase().includes(q));
}

/** BPI が未算出（通信できなかった）の記録。通信復帰後に再計算する */
export async function listPendingBpi(): Promise<ResultRecord[]> {
  return (await listResults()).filter((r) => r.bpiStatus === "pending");
}
