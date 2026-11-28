import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest } from "@/lib/storage/db";
import { BEAT_SEEKER_API, consistentJudge, fetchMe, looksLikeToken, normalizeToken, playBody, previewBeatSeekerScore, registerBeatSeekerScore, revertBeatSeekerSubmission, toJstIso, type BeatSeekerPlay } from "@/lib/beatSeeker/client";
import { beatSeekerBlockedReason, beatSeekerPlay, headlinePt } from "@/features/result/BeatSeekerPreview";
import { registerErrorMessage, revertErrorMessage } from "@/hooks/useBeatSeekerSync";
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

describe("beat-seeker への登録（POST /scores）と取り消し", () => {
  it("撮影日時は +09:00 付きの ISO 8601 にする", () => {
    // 2026-11-28 12:03:00 UTC = 21:03:00 JST
    expect(toJstIso(Date.UTC(2026, 10, 28, 12, 3, 0))).toBe("2026-11-28T21:03:00+09:00");
    // 日付をまたぐ（15:00 UTC 以降は、翌日）
    expect(toJstIso(Date.UTC(2026, 10, 28, 16, 0, 5))).toBe("2026-11-29T01:00:05+09:00");
  });

  it("clientRequestId と playedAt を付けて送り、submissionId・updated・duplicate を返す", async () => {
    const fetchImpl = respond(200, { submissionId: 7, updated: true, duplicate: false });
    expect(await registerBeatSeekerScore("bs_live_x", play, "req-1", "2026-11-28T21:03:00+09:00", fetchImpl)).toEqual({ kind: "ok", submissionId: 7, updated: true, duplicate: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BEAT_SEEKER_API}/api/external/v1/scores`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer bs_live_x");
    expect(JSON.parse(init.body)).toMatchObject({ title: "冥", clearType: "HARD CLEAR", clientRequestId: "req-1", playedAt: "2026-11-28T21:03:00+09:00", version: 34 });
  });

  it("再送（duplicate）・記録が伸びなかった（updated: false）も、そのまま返す", async () => {
    expect(await registerBeatSeekerScore("t", play, "r", "x", respond(200, { submissionId: 7, updated: false, duplicate: true }))).toEqual({ kind: "ok", submissionId: 7, updated: false, duplicate: true });
  });

  it("401 は invalid、403 は forbidden（登録の権限がない）、429 は rate-limited、400・404 は受け付けない内容、形が違えば error", async () => {
    expect(await registerBeatSeekerScore("t", play, "r", "x", respond(401, {}))).toEqual({ kind: "invalid" });
    expect(await registerBeatSeekerScore("t", play, "r", "x", respond(403, {}))).toEqual({ kind: "forbidden" });
    expect(await registerBeatSeekerScore("t", play, "r", "x", respond(429, {}))).toEqual({ kind: "rate-limited" });
    expect(await registerBeatSeekerScore("t", play, "r", "x", respond(400, { code: "JUDGE_MISMATCH", error: "合いません" }))).toEqual({ kind: "rejected", code: "JUDGE_MISMATCH", message: "合いません" });
    expect((await registerBeatSeekerScore("t", play, "r", "x", respond(200, { foo: 1 }))).kind).toBe("error");
    expect((await registerBeatSeekerScore("t", play, "r", "x", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).kind).toBe("error");
  });

  it("取り消し：DELETE で送る。409 は取り消せない（理由つき）、401・403 はトークンの問題", async () => {
    const ok = respond(200, { reverted: true });
    expect(await revertBeatSeekerSubmission("t", 7, ok)).toEqual({ kind: "ok" });
    expect(ok.mock.calls[0][0]).toBe(`${BEAT_SEEKER_API}/api/external/v1/scores/submissions/7`);
    expect(ok.mock.calls[0][1].method).toBe("DELETE");
    expect(await revertBeatSeekerSubmission("t", 7, respond(409, { code: "CHANGED_SINCE", error: "あとから変わっています" }))).toEqual({ kind: "conflict", code: "CHANGED_SINCE", message: "あとから変わっています" });
    expect(await revertBeatSeekerSubmission("t", 7, respond(401, {}))).toEqual({ kind: "invalid" });
    expect(await revertBeatSeekerSubmission("t", 7, respond(403, {}))).toEqual({ kind: "forbidden" });
    expect((await revertBeatSeekerSubmission("t", 7, vi.fn().mockRejectedValue(new Error("x")))).kind).toBe("error");
  });
});

describe("beat-seeker の登録のメッセージと、送れない理由", () => {
  const record = (over: Record<string, unknown> = {}) =>
    ({ chart: { playStyle: "SP", difficulty: "ANOTHER", title: "冥", level: 12, notes: 1000, songId: 1 }, exScore: 1600, clearType: "HARD CLEAR", missCount: 3, judge: null, ...over }) as unknown as Parameters<typeof beatSeekerBlockedReason>[0];

  it("送れるときは null。権限がない・DP や INFINITAS・ランプが分からないときは、理由を返す", () => {
    expect(beatSeekerBlockedReason(record(), "latest", true)).toBeNull();
    expect(beatSeekerBlockedReason(record(), "latest", false)).toContain("権限");
    expect(beatSeekerBlockedReason(record({ chart: { playStyle: "DP" } }), "latest", true)).toContain("SP の最新バージョン");
    expect(beatSeekerBlockedReason(record(), "inf", true)).toContain("SP の最新バージョン");
    expect(beatSeekerBlockedReason(record({ clearType: null }), "latest", true)).toContain("クリアランプ");
    expect(beatSeekerBlockedReason(null, "latest", true)).toBeNull();
  });

  it("送る内容は、SP の最新バージョンでランプが分かるときだけ。EX と合わない判定内訳は送らない", () => {
    expect(beatSeekerPlay(record(), "latest")).toMatchObject({ title: "冥", difficulty: "ANOTHER", exScore: 1600, clearType: "HARD CLEAR", missCount: 3, judge: null });
    expect(beatSeekerPlay(record({ clearType: "NO PLAY" }), "latest")).toBeNull();
    expect(beatSeekerPlay(record(), "inf")).toBeNull();
    expect(beatSeekerPlay(record({ judge: { pgreat: 700, great: 200 } }), "latest")?.judge).toEqual({ pgreat: 700, great: 200 });
    expect(beatSeekerPlay(record({ exScore: 1599, judge: { pgreat: 700, great: 200 } }), "latest")?.judge).toBeNull();
  });

  it("登録・取り消しの失敗を、日本語にする", () => {
    expect(registerErrorMessage({ kind: "forbidden" })).toContain("権限");
    expect(registerErrorMessage({ kind: "invalid" })).toContain("トークンが無効");
    expect(registerErrorMessage({ kind: "rate-limited" })).toContain("回数制限");
    expect(registerErrorMessage({ kind: "rejected", code: "CHART_NOT_FOUND", message: "x" })).toContain("見つかりませんでした");
    expect(registerErrorMessage({ kind: "rejected", code: "JUDGE_MISMATCH", message: "合いません" })).toBe("合いません");
    expect(revertErrorMessage({ kind: "conflict", code: "CHANGED_SINCE", message: "x" })).toContain("あとから記録が変わっている");
    expect(revertErrorMessage({ kind: "conflict", code: "ALREADY_REVERTED", message: "x" })).toContain("取り消し済み");
  });
});
