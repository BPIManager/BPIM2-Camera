import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest } from "@/lib/storage/db";
import { clearHistory, deleteResult, filterResults, listPendingBpi, listResults, saveResult } from "@/lib/storage/history";
import { defaultSettings, loadSettings } from "@/lib/storage/settings";
import { record } from "./fixtures";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTest();
});

describe("history", () => {
  it("新しい順に保存・削除でき、☆10以下の対象外レコードも保存できる", async () => {
    await saveResult(record({ id: "a", createdAt: 1 }));
    await saveResult(record({ id: "b", createdAt: 2, bpiStatus: "pending" }));
    expect((await listResults()).map((r) => r.id)).toEqual(["b", "a"]);
    expect((await listPendingBpi()).map((r) => r.id)).toEqual(["b"]);
    await deleteResult("a");
    expect((await listResults()).map((r) => r.id)).toEqual(["b"]);
    await clearHistory();
    expect(await listResults()).toEqual([]);
  });

  it("曲名で検索できる", () => {
    const rs = [record({ id: "a" })];
    expect(filterResults(rs, "heart")).toHaveLength(1);
    expect(filterResults(rs, "zzz")).toHaveLength(0);
  });
});

describe("settings", () => {
  it("初回は既定値を保存し、2回目以降は同じ端末 ID を返す", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const first = loadSettings(storage);
    expect(first.autoCapture).toBe(true);
    expect(loadSettings(storage).deviceId).toBe(first.deviceId);
    expect(defaultSettings().statsConsent).toBeNull();
  });
});
