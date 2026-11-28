import { describe, expect, it, vi } from "vitest";
import { flattenHistory, groupHistoryByVersion, pickBpiSong, personalBest, personalBestEntry, personalBestDiff, previewScore, rankWithSelf, resolveSongRoute, songPaths, syncScore } from "@/lib/bpi/songData";

let token: string | null = null;
vi.mock("@/lib/firebase/auth", () => ({ currentIdToken: async () => token }));

describe("自己ベストと自己歴代の点差", () => {
  const history = flattenHistory({
    "32": [{ exScore: 1700, bpi: 40, lastPlayed: "2025-01-01T00:00:00Z" }],
    "33": [
      { exScore: 1800, bpi: 50, lastPlayed: "2026-02-01T00:00:00Z" },
      { exScore: null, bpi: null, lastPlayed: "2026-03-01T00:00:00Z" },
    ],
  });

  it("バージョンをまたいで 1 本にし、新しい順。スコアのない行は捨てる", () => {
    expect(history.map((h) => h.exScore)).toEqual([1800, 1700]);
    expect(history[0].version).toBe("33");
  });

  it("全バージョンの最高点が自己ベスト。記録なしは null", () => {
    expect(personalBest(history)).toBe(1800);
    expect(personalBest([])).toBeNull();
    expect(personalBest(null)).toBeNull();
  });

  it("自己ベストを出したバージョンも返す。同点が複数あれば、最初に出した（古い）ほう", () => {
    expect(personalBestEntry(history)).toEqual({ exScore: 1800, version: "33" });
    const tie = flattenHistory({
      "32": [{ exScore: 1800, bpi: 50, lastPlayed: "2025-01-01T00:00:00Z" }],
      "33": [{ exScore: 1800, bpi: 50, lastPlayed: "2026-02-01T00:00:00Z" }],
    });
    expect(personalBestEntry(tie)).toEqual({ exScore: 1800, version: "32" });
    expect(personalBestEntry([])).toBeNull();
  });

  it("自己ベストとの差は、下回ったとき（マイナス）や同点（0）も返す。初プレーだけ null", () => {
    expect(personalBestDiff(1812, 1800)).toBe(12);
    expect(personalBestDiff(1800, 1800)).toBe(0);
    expect(personalBestDiff(1700, 1800)).toBe(-100);
    expect(personalBestDiff(1700, null)).toBeNull();
  });

  it("バージョンごとにまとめ、新しいバージョンを先に。同じバージョン内では 1 つ前のスコアとの差を付ける", () => {
    const groups = groupHistoryByVersion(
      flattenHistory({
        "32": [{ exScore: 1700, bpi: 40, lastPlayed: "2025-01-01T00:00:00Z" }],
        "33": [
          { exScore: 1800, bpi: 50, lastPlayed: "2026-02-01T00:00:00Z" },
          { exScore: 1750, bpi: 45, lastPlayed: "2026-01-01T00:00:00Z" },
        ],
        INF: [{ exScore: 1600, bpi: 30, lastPlayed: "2026-05-01T00:00:00Z" }],
      }),
    );
    expect(groups.map((g) => g.version)).toEqual(["33", "32", "INF"]);
    expect(groups[0].records.map((r) => r.scoreDiff)).toEqual([50, null]);
    expect(groups[1].records[0].scoreDiff).toBeNull();
  });
});

describe("ランキングへの自分の差し込み", () => {
  const self = { userId: "me", userName: "自分", profileImage: null };
  const rows = [
    { userId: "a", userName: "A", exScore: 2000, bpi: 70 },
    { userId: "me", userName: "自分", exScore: 1500, bpi: 30 },
    { userId: "b", userName: "B", exScore: 1800, bpi: 50 },
  ];

  it("保存済みの自分の行は、今回のスコアで置き換えて順位を付ける", () => {
    const r = rankWithSelf(rows, self, 1900, 60);
    expect(r.map((x) => [x.userId, x.rank])).toEqual([
      ["a", 1],
      ["me", 2],
      ["b", 3],
    ]);
    expect(r.filter((x) => x.isSelf)).toHaveLength(1);
    expect(r.find((x) => x.isSelf)?.exScore).toBe(1900);
  });

  it("同点は同順位で、自分を先に置く", () => {
    const r = rankWithSelf(rows, self, 1800, 50);
    expect(r.map((x) => [x.userId, x.rank])).toEqual([
      ["a", 1],
      ["me", 2],
      ["b", 2],
    ]);
  });

  it("ライバルがいなければ自分だけ 1 位", () => {
    expect(rankWithSelf([], self, 1000, null)).toEqual([expect.objectContaining({ userId: "me", rank: 1, isSelf: true })]);
  });
});

describe("曲の ID の系統（allSongs と songs）", () => {
  const chart = { songId: 5365, title: "Sky High", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1943 } as const;
  const row = (over: object = {}) => ({ songId: 1234, title: "Sky High", difficulty: "ANOTHER", difficultyLevel: 12, notes: 1943, ...over });

  it("☆10 以下は検索せず、曲マスタの ID のまま all-scores 系にする", async () => {
    const fetchImpl = vi.fn();
    expect(await resolveSongRoute({ ...chart, level: 10, songId: 77 }, fetchImpl)).toEqual({ kind: "all", songId: 77 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("☆11・☆12 は曲検索で songs の ID を引く。同じ曲は 2 回目から検索しない", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: false, body: [row({ songId: 999, title: "Sky High Remix" }), row()] }) });
    const c = { ...chart, title: "Sky High (cache test)" };
    fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ error: false, body: [row({ title: c.title })] }) });
    expect(await resolveSongRoute(c, fetchImpl)).toEqual({ kind: "bpi", songId: 1234 });
    await resolveSongRoute(c, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("検索に失敗・該当なしなら null で、次回やり直せる", async () => {
    const c = { ...chart, title: "Failing Song" };
    const bad = vi.fn().mockResolvedValue({ ok: false });
    expect(await resolveSongRoute(c, bad)).toBeNull();
    const good = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: false, body: [row({ title: c.title })] }) });
    expect(await resolveSongRoute(c, good)).toEqual({ kind: "bpi", songId: 1234 });
  });

  it("検索結果から譜面を選ぶ：曲名と難易度が一致するもの。曲名が合わなくても難易度とノーツ数が一致する 1 件ならその曲", () => {
    expect(pickBpiSong([row({ songId: 1, difficulty: "HYPER" }), row({ songId: 2 })], chart)?.songId).toBe(2);
    expect(pickBpiSong([row({ songId: 3, title: "Sky  High" })], chart)?.songId).toBe(3);
    expect(pickBpiSong([row({ songId: 3, title: "A" }), row({ songId: 4, title: "B" })], chart)).toBeNull();
    expect(pickBpiSong([row({ songId: 5, title: "Other", notes: 100 })], chart)).toBeNull();
  });

  it("API のパスは、☆10 以下（all-scores）と ☆11・☆12（scores）で違う", () => {
    expect(songPaths({ kind: "all", songId: 7 }, "u1", "34")).toEqual({
      history: "/api/v2/users/u1/all-scores/7/history",
      rivals: "/api/v2/users/u1/all-scores/7/rivals?version=34",
      global: "/api/v2/users/u1/all-scores/7/ranking?version=34",
    });
    expect(songPaths({ kind: "bpi", songId: 9 }, "u1", "34")).toEqual({
      history: "/api/v2/users/u1/scores/9/history",
      rivals: "/api/v2/users/u1/rivals/following/scores/9?version=34",
      global: "/api/v2/users/u1/ranking/song/9?version=34",
    });
  });
});

describe("BPIM2 へのスコア保存", () => {
  const chart = { songId: 5365, title: "Sky High", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1943 } as const;
  const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });

  it("曲の ID は allSongs のものとして、バージョン・EX スコアと一緒に POST する", async () => {
    token = "tok";
    const fetchImpl = respond(200, { error: false, body: {} });
    expect(await syncScore("u1", chart, 3100, "34", undefined, fetchImpl)).toEqual({ kind: "saved" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/bpim2-api/api/v2/users/u1/scores/manual");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ songId: 5365, songDomain: "allSongs", version: "34", exScore: 3100, useOption: null, missCount: null });
  });

  it("使用オプションとミスカウントも送る", async () => {
    token = "tok";
    const fetchImpl = respond(200, { error: false, body: {} });
    await syncScore("u1", chart, 3100, "34", { useOption: "RANDOM", missCount: 7 }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ useOption: "RANDOM", missCount: 7 });
  });

  it("自己ベストを上回っていない 400 は、エラーではなく「未更新」として扱う", async () => {
    token = "tok";
    const r = await syncScore("u1", chart, 100, "34", undefined, respond(400, { error: true, errorMessage: "現在の自己ベストを上回っていません。" }));
    expect(r).toEqual({ kind: "not-improved" });
  });

  it("それ以外の失敗・通信エラー・未サインインは error", async () => {
    token = "tok";
    expect((await syncScore("u1", chart, 100, "34", undefined, respond(404, { error: true, errorMessage: "楽曲が見つかりませんでした。" }))).kind).toBe("error");
    expect((await syncScore("u1", chart, 100, "34", undefined, vi.fn().mockRejectedValue(new Error("offline")))).kind).toBe("error");
    token = null;
    const fetchImpl = vi.fn();
    expect((await syncScore("u1", chart, 100, "34", undefined, fetchImpl)).kind).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("BPIM2 の総合BPIのプレビュー（保存しない）", () => {
  const chart = { songId: 5365, title: "Sky High", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1943 } as const;
  const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });

  it("preview: true を付けて同じ API に送り、自己ベストを上回るかと、総合BPIの変動を返す", async () => {
    token = "tok";
    const fetchImpl = respond(200, { error: false, body: { preview: true, improved: true, totalBpi: { before: 7.5, after: 9, delta: 1.5 } } });
    expect(await previewScore("u1", chart, 3100, "34", { useOption: "RANDOM", missCount: 7 }, fetchImpl)).toEqual({ improved: true, totalBpi: { before: 7.5, after: 9, delta: 1.5 } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/bpim2-api/api/v2/users/u1/scores/manual");
    expect(JSON.parse(init.body)).toEqual({ songId: 5365, songDomain: "allSongs", version: "34", exScore: 3100, useOption: "RANDOM", missCount: 7, preview: true });
  });

  it("総合BPIの対象外（☆10 以下など）は totalBpi が null", async () => {
    token = "tok";
    expect(await previewScore("u1", chart, 100, "34", undefined, respond(200, { error: false, body: { improved: true, totalBpi: null } }))).toEqual({ improved: true, totalBpi: null });
  });

  it("失敗・通信エラー・未サインイン・形が違うときは null（画面は何も出さない）", async () => {
    token = "tok";
    expect(await previewScore("u1", chart, 100, "34", undefined, respond(404, { error: true }))).toBeNull();
    expect(await previewScore("u1", chart, 100, "34", undefined, respond(200, { error: false, body: { foo: 1 } }))).toBeNull();
    expect(await previewScore("u1", chart, 100, "34", undefined, vi.fn().mockRejectedValue(new Error("offline")))).toBeNull();
    token = null;
    const fetchImpl = vi.fn();
    expect(await previewScore("u1", chart, 100, "34", undefined, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
