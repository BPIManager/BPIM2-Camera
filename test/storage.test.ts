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

describe("settings の枠調整", () => {
  const mem = (value: unknown) => {
    const m = new Map<string, string>([["bpim2-camera:settings", JSON.stringify(value)]]);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const ok = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };

  it("正しい枠は読み込み、壊れた枠だけを捨てる（その枠は既定値になる）", () => {
    const s = loadSettings(mem({ guides: { "1P": { score: ok, title: ok }, "2P": { score: ok, title: { x: 2, y: 0, width: 1, height: 1 } } } }));
    expect(s.guides["1P"]).toBeDefined();
    expect(s.guides["2P"]).toEqual({ score: ok });
  });

  it("枠の項目がない古い保存値でも既定値で動く", () => {
    expect(loadSettings(mem({ autoCapture: false })).guides).toEqual({});
  });
});

describe("settings の枠（4 枠化後）", () => {
  const mem = (value: unknown) => {
    const m = new Map<string, string>([["bpim2-camera:settings", JSON.stringify(value)]]);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const ok = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };

  it("スコアと曲名だけの古い保存値でも読み込める（足りない枠は既定値）", () => {
    const s = loadSettings(mem({ guides: { "1P": { score: ok, title: ok } } }));
    expect(s.guides["1P"]).toEqual({ score: ok, title: ok });
  });

  it("壊れた枠だけを捨て、有効な枠は残す", () => {
    const s = loadSettings(mem({ guides: { "1P": { score: ok, rank: { x: 2, y: 0, width: 1, height: 1 } } } }));
    expect(s.guides["1P"]).toEqual({ score: ok });
  });
});
