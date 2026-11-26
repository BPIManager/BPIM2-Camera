import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest } from "@/lib/storage/db";
import { loadMaster, refreshMaster } from "@/lib/songs/repository";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTest();
});

const body = { version: "v1", songs: [{ songId: 9, title: "X", playStyle: "SP", difficulty: "HYPER", level: 7, notes: 500 }] };
const apiOk = (version = "v1") =>
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ ETag: `"${version}"` }),
    json: async () => ({ error: false, body: { ...body, version } }),
  });

describe("曲マスタ", () => {
  it("API から取得して ☆7 のような ☆10 以下の譜面も保持する", async () => {
    const m = await loadMaster(apiOk());
    expect(m.songs[0].level).toBe(7);
  });

  it("API に届かなければ同梱シードで起動する", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ json: async () => ({ version: "seed-0", songs: [] }) });
    expect((await loadMaster(f)).version).toBe("seed-0");
  });

  it("版が変わっていれば差し替え、304 なら何もしない", async () => {
    await loadMaster(apiOk("v1"));
    expect(await refreshMaster(apiOk("v2"))).toBe(true);
    const notModified = vi.fn().mockResolvedValue({ ok: false, status: 304, headers: new Headers() });
    expect(await refreshMaster(notModified)).toBe(false);
  });
});
