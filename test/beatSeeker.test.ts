import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest } from "@/lib/storage/db";
import { BEAT_SEEKER_API, consistentJudge, fetchMe, looksLikeToken, normalizeToken, playBody, previewBeatSeekerScore, type BeatSeekerPlay } from "@/lib/beatSeeker/client";
import { headlinePt } from "@/features/result/BeatSeekerPreview";
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

const play: BeatSeekerPlay = { title: "冥", difficulty: "ANOTHER", exScore: 1600, judge: { pgreat: 700, great: 200 }, clearType: "HARD CLEAR", missCount: 30 };

const pt = (chart: { before: number; after: number } | null, delta = 12.5) => ({ chart, total: { before: 100, after: 100 + delta, delta }, tier: { before: "Master II", after: "Master III" } });
const previewBody = (over: object = {}) => ({
  chart: { title: "冥", level: 12, unofficialLevel: "12.8" },
  improved: { exScore: false, clearType: true, missCount: false },
  willUpdate: true,
  beatPt: pt({ before: 139.51, after: 140.2 }),
  ratePt: pt({ before: 1.2, after: 1.5 }, 3),
  ...over,
});

describe("beat-seeker に送る内容", () => {
  it("判定内訳は、PGREAT×2+GREAT = EX で、合計がノーツ数以内のときだけ送る（合わないと 400 になるため）", () => {
    expect(consistentJudge({ pgreat: 700, great: 200 }, 1600, 1000)).toEqual({ pgreat: 700, great: 200 });
    expect(consistentJudge({ pgreat: 700, great: 200 }, 1601, 1000)).toBeNull();
    expect(consistentJudge({ pgreat: 700, great: 200 }, 1600, 800)).toBeNull();
    expect(consistentJudge(null, 1600, 1000)).toBeNull();
  });

  it("本文：SP・現行作の作品番号（整数）。判定内訳がなければ送らない。FAILED のミスカウントは送らない", () => {
    expect(playBody(play)).toEqual({ title: "冥", playStyle: "SP", difficulty: "ANOTHER", exScore: 1600, pgreat: 700, great: 200, clearType: "HARD CLEAR", missCount: 30, version: 34 });
    expect(playBody({ ...play, judge: null, missCount: null })).not.toHaveProperty("pgreat");
    expect(playBody({ ...play, judge: null, missCount: null })).not.toHaveProperty("missCount");
    expect(playBody({ ...play, clearType: "FAILED" })).not.toHaveProperty("missCount");
  });
});

describe("beat-seeker のプレビュー（POST /scores/preview）", () => {
  it("Bearer で送り、変動を返す。Cookie は使わない", async () => {
    const fetchImpl = respond(200, previewBody());
    const r = await previewBeatSeekerScore("bs_live_x", play, fetchImpl);
    expect(r.kind).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BEAT_SEEKER_API}/api/external/v1/scores/preview`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer bs_live_x");
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body)).toMatchObject({ title: "冥", clearType: "HARD CLEAR" });
  });

  it("401 は invalid、429 は rate-limited、400・404 は受け付けない内容（コードと日本語の説明）、それ以外は error", async () => {
    expect(await previewBeatSeekerScore("t", play, respond(401, {}))).toEqual({ kind: "invalid" });
    expect(await previewBeatSeekerScore("t", play, respond(429, { code: "RATE_LIMITED" }))).toEqual({ kind: "rate-limited" });
    expect(await previewBeatSeekerScore("t", play, respond(404, { code: "CHART_NOT_FOUND", error: "譜面が見つかりません" }))).toEqual({ kind: "rejected", code: "CHART_NOT_FOUND", message: "譜面が見つかりません" });
    expect(await previewBeatSeekerScore("t", play, respond(400, { code: "JUDGE_MISMATCH", error: "合いません" }))).toMatchObject({ kind: "rejected", code: "JUDGE_MISMATCH" });
    expect((await previewBeatSeekerScore("t", play, respond(500, {}))).kind).toBe("error");
    expect((await previewBeatSeekerScore("t", play, respond(200, { foo: 1 }))).kind).toBe("error");
    expect((await previewBeatSeekerScore("t", play, vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).kind).toBe("error");
  });
});

describe("数値の欄に出す PT", () => {
  const preview = previewBody() as Parameters<typeof headlinePt>[0];

  it("☆11 以上は BEAT-PT、☆10 以下は Rate-PT（新しい値と、総合の差）", () => {
    expect(headlinePt(preview, 12)).toEqual({ label: "BEAT-PT", value: 140.2, totalDelta: 12.5 });
    expect(headlinePt(preview, 10)).toEqual({ label: "Rate-PT", value: 1.5, totalDelta: 3 });
  });

  it("その譜面が対象外なら、もう一方。どちらも対象外なら null", () => {
    const beatOnly = previewBody({ ratePt: pt(null) }) as Parameters<typeof headlinePt>[0];
    const rateOnly = previewBody({ beatPt: pt(null) }) as Parameters<typeof headlinePt>[0];
    const neither = previewBody({ beatPt: pt(null), ratePt: pt(null) }) as Parameters<typeof headlinePt>[0];
    expect(headlinePt(beatOnly, 10)?.label).toBe("BEAT-PT");
    expect(headlinePt(rateOnly, 12)?.label).toBe("Rate-PT");
    expect(headlinePt(neither, 12)).toBeNull();
  });
});
