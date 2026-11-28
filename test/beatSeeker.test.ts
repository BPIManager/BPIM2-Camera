import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest } from "@/lib/storage/db";
import { BEAT_SEEKER_API, fetchMe, looksLikeToken, normalizeToken } from "@/lib/beatSeeker/client";
import { clearBeatSeekerLink, loadBeatSeekerLink, resetBeatSeekerCacheForTest, saveBeatSeekerLink, subscribeBeatSeekerLink } from "@/lib/beatSeeker/token";

const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });

describe("beat-seeker のトークンの確認（GET /me）", () => {
  it("Bearer で送り、持ち主と権限を返す。Cookie は使わない", async () => {
    const fetchImpl = respond(200, { iidxId: "1234-5678", displayName: "tester", scopes: ["scores:write"] });
    expect(await fetchMe("bs_live_x", fetchImpl)).toEqual({ kind: "ok", me: { iidxId: "1234-5678", displayName: "tester", scopes: ["scores:write"] } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BEAT_SEEKER_API}/api/external/v1/me`);
    expect(init.headers.Authorization).toBe("Bearer bs_live_x");
    expect(init.credentials).toBeUndefined();
  });

  it("401 は無効なトークン。それ以外の失敗・通信エラー・時間切れは error", async () => {
    expect(await fetchMe("t", respond(401, {}))).toEqual({ kind: "invalid" });
    expect((await fetchMe("t", respond(500, { error: "落ちています" })))).toEqual({ kind: "error", message: "落ちています" });
    expect((await fetchMe("t", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).kind).toBe("error");
    const hang = vi.fn((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
    const r = await fetchMe("t", hang as unknown as typeof fetch, 10);
    expect(r).toEqual({ kind: "error", message: expect.stringContaining("応答がありません") });
  });

  it("応答の形が違えば error。scopes がなければ空（読み取り専用）", async () => {
    expect((await fetchMe("t", respond(200, { foo: 1 }))).kind).toBe("error");
    expect(await fetchMe("t", respond(200, { iidxId: "1", displayName: "a" }))).toEqual({ kind: "ok", me: { iidxId: "1", displayName: "a", scopes: [] } });
  });

  it("貼り付けたトークンの前後の空白を除き、bs_live_ で始まるかを見る", () => {
    expect(normalizeToken("  bs_live_abc\n")).toBe("bs_live_abc");
    expect(looksLikeToken("bs_live_abc")).toBe(true);
    expect(looksLikeToken("bs_live_")).toBe(false);
    expect(looksLikeToken("abc")).toBe(false);
    expect(looksLikeToken("bs_live_a b")).toBe(false);
  });
});

describe("beat-seeker の連携の保存（IndexedDB）", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTest();
    resetBeatSeekerCacheForTest();
  });

  const link = { token: "bs_live_abc", me: { iidxId: "1", displayName: "a", scopes: ["scores:write"] }, verifiedAt: 1 };

  it("保存して読み直せる。解除すると null。保存・解除を知らせる", async () => {
    const heard = vi.fn();
    const off = subscribeBeatSeekerLink(heard);
    expect(await loadBeatSeekerLink()).toBeNull();
    await saveBeatSeekerLink(link);
    resetBeatSeekerCacheForTest();
    expect(await loadBeatSeekerLink()).toEqual(link);
    await clearBeatSeekerLink();
    resetBeatSeekerCacheForTest();
    expect(await loadBeatSeekerLink()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });
});
