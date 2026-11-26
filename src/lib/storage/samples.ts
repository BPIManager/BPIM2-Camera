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
