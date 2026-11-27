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

/** 送信済みの印を付ける。送っている間に内容が変わっていた（rev が進んだ）ときは付けず、次の機会に送り直す */
export async function markUploaded(id: string, rev: number, at = Date.now()): Promise<void> {
  const db = await getDb();
  const s = await db.get("samples", id);
  if (s && (s.rev ?? 0) === rev) await db.put("samples", { ...s, uploadedAt: at });
}

/** 読み取り後に貯めたサンプルへ、ユーザーが確定した値（正解ラベル）を入れる。送信済みでも、送り直すよう未送信に戻す */
export async function confirmSample(
  id: string,
  label: Pick<TrainingSample, "chart" | "exScore" | "autoConfirmed" | "correctedFields">,
): Promise<boolean> {
  const db = await getDb();
  const s = await db.get("samples", id);
  if (!s) return false;
  const { uploadedAt: _sent, ...rest } = s;
  await db.put("samples", { ...rest, ...label, confirmed: true, rev: (s.rev ?? 0) + 1 });
  return true;
}
