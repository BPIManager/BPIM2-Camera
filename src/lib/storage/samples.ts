import { getDb, type TrainingSample } from "./db";

export async function saveSample(sample: TrainingSample): Promise<void> {
  await (await getDb()).put("samples", sample);
}

export async function listSamples(): Promise<TrainingSample[]> {
  return (await getDb()).getAllFromIndex("samples", "by-date");
}

export async function countSamples(): Promise<number> {
  return (await getDb()).count("samples");
}

export async function clearSamples(): Promise<void> {
  await (await getDb()).clear("samples");
}

/** 未送信の件数 */
export async function countPendingSamples(): Promise<number> {
  return (await listSamples()).filter((s) => s.uploadedAt === undefined).length;
}

export async function markUploaded(id: string, at = Date.now()): Promise<void> {
  const db = await getDb();
  const s = await db.get("samples", id);
  if (s) await db.put("samples", { ...s, uploadedAt: at });
}
