import "fake-indexeddb/auto";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest, type TrainingSample } from "@/lib/storage/db";
import { clearSamples, countSamples, listSamples, saveSample } from "@/lib/storage/samples";
import { buildTrainingZip } from "@/lib/training/exportZip";
import { record } from "./fixtures";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTest();
});

const sample = (id: string, over: Partial<TrainingSample> = {}): TrainingSample => ({
  id,
  createdAt: Number(id.replace(/\D/g, "")) || 1,
  playSide: "1P",
  chart: record().chart,
  exScore: 1796,
  autoConfirmed: false,
  correctedFields: ["exScore"],
  scoreCrop: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  titleCrop: new Blob([new Uint8Array([4, 5])], { type: "image/jpeg" }),
  ...over,
});

describe("学習サンプルの保存", () => {
  it("保存・件数・新しい順でなく日時順の取得・削除ができる", async () => {
    await saveSample(sample("s2"));
    await saveSample(sample("s1"));
    expect(await countSamples()).toBe(2);
    expect((await listSamples()).map((s) => s.id)).toEqual(["s1", "s2"]);
    await clearSamples();
    expect(await countSamples()).toBe(0);
  });
});

describe("buildTrainingZip", () => {
  it("正解ラベル(labels.json)とスコア部・曲名帯の画像だけを含める（全体画像は含めない）", async () => {
    const { blob, labels } = await buildTrainingZip([sample("s1"), sample("s2", { exScore: 3365, correctedFields: [] , autoConfirmed: true })]);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["images/s1_score.jpg", "images/s1_title.jpg", "images/s2_score.jpg", "images/s2_title.jpg", "labels.json"]);
    const json = JSON.parse(new TextDecoder().decode(files["labels.json"]));
    expect(json[1]).toMatchObject({ exScore: 3365, digits: "3365", autoConfirmed: true, title: "HEARTACHE", notes: 930 });
    expect(labels).toHaveLength(2);
    expect(Array.from(files["images/s1_score.jpg"])).toEqual([1, 2, 3]);
  });
});

describe("OCR の読み取りの記録", () => {
  it("あれば labels.json に入れ、なければ入れない", async () => {
    const ocr = { title: ["Verflucht(99)"], score: [["2401(90)"]], judge: [], result: { ex: 4234 }, ms: 812 };
    const { labels } = await buildTrainingZip([sample("s1", { ocr }), sample("s2")]);
    expect(labels[0].ocr).toEqual(ocr);
    expect(labels[1].ocr).toBeUndefined();
  });
});
