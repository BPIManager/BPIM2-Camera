import { describe, expect, it } from "vitest";
import { decideExScore } from "@/lib/recognition/consensus/engine";
import { isNearestBoundary, rankOf, rankRange, rankThreshold } from "@/lib/recognition/consensus/ranks";

describe("ランクの基準点（手持ちサンプルの実測で確認）", () => {
  it("UNDO THE NIGHT（ノーツ 1787）: AAA +0188 → 3365", () => {
    expect(rankThreshold("AAA", 1787) + 188).toBe(3365);
  });
  it("Angel's Ladder（ノーツ 1800）: AAA +0104 → 3304", () => {
    expect(rankThreshold("AAA", 1800)).toBe(3200);
    expect(3200 + 104).toBe(3304);
  });
  it("Boomy and The Boost（ノーツ 1826）: MAX -0201 → 3451", () => {
    expect(rankThreshold("MAX", 1826) - 201).toBe(3451);
  });
  it("差分表示は最も近い基準点: 3451 は AAA(+204) より MAX(-201) が近い", () => {
    expect(isNearestBoundary("MAX", 3451, 1826)).toBe(true);
    expect(isNearestBoundary("AAA", 3451, 1826)).toBe(false);
    expect(isNearestBoundary("AAA", 3304, 1800)).toBe(true);
  });
  it("ランクの範囲と判定", () => {
    expect(rankRange("AAA", 1800)).toEqual({ min: 3200, max: 3599 });
    expect(rankRange("MAX", 1800)).toEqual({ min: 3600, max: 3600 });
    expect(rankOf(3304, 1800)).toBe("AAA");
    expect(rankOf(3600, 1800)).toBe("MAX");
    expect(rankOf(100, 1800)).toBe("F");
  });
});

describe("decideExScore", () => {
  it("独立した 3 つの読み（スコア欄・ジャッジ表・ランク差分）が一致すれば確定する", () => {
    const r = decideExScore({
      notes: 1787,
      score: [3365],
      judge: { pg: 1591, gr: 183 },
      rankGap: { rank: "AAA", sign: "+", gap: 188 },
    });
    expect(r.status).toBe("confirmed");
    expect(r.value).toBe(3365);
    expect(r.ranked[0].sources).toEqual(expect.arrayContaining(["score", "judge", "rankGap"]));
  });

  it("スコア欄が読み誤り（2365）でも、他の 2 つが一致すれば正しい値で確定する", () => {
    const r = decideExScore({
      notes: 1787,
      score: [2365],
      judge: { pg: 1591, gr: 183 },
      rankGap: { rank: "AAA", sign: "+", gap: 188 },
    });
    expect(r.value).toBe(3365);
    expect(r.ranked.map((c) => c.value)).toContain(2365);
  });

  it("符号が読めなくても、ランクの範囲と最近接の制約で絞れる（AAA ?0104）", () => {
    const r = decideExScore({ notes: 1800, score: [3304], rankGap: { rank: "AAA", sign: null, gap: 104 }, currentRank: "AAA" });
    expect(r.value).toBe(3304);
    expect(r.rejected.some((x) => x.value === 3096)).toBe(true);
  });

  it("MAX は理論値からの減算だけが成り立つ（MAX ?0201）", () => {
    const r = decideExScore({ notes: 1826, score: [3451], rankGap: { rank: "MAX", sign: null, gap: 201 } });
    expect(r.value).toBe(3451);
  });

  it("1 つの読みだけでは確定しない（候補として返す）", () => {
    const r = decideExScore({ notes: 1800, score: [3304] });
    expect(r.status).toBe("insufficient");
    expect(r.value).toBeNull();
    expect(r.ranked[0].value).toBe(3304);
  });

  it("5 種のジャッジが読めて合計がノーツ数に一致すれば、検算が独立した裏付けになる", () => {
    const r = decideExScore({ notes: 930, judge: { pg: 867, gr: 62, gd: 1, bd: 0, poor: 0 } });
    expect(r.status).toBe("confirmed");
    expect(r.value).toBe(1796);
    expect(r.ranked[0].sources).toEqual(expect.arrayContaining(["judge", "judgeSum"]));
  });

  it("ジャッジの合計が合わなければ重みを下げ、単独では確定しない", () => {
    const r = decideExScore({ notes: 930, judge: { pg: 867, gr: 62, gd: 1, bd: 0, poor: 5 } });
    expect(r.status).toBe("insufficient");
    expect(r.ranked[0].weight).toBe(0.5);
  });

  it("初回プレー（ベスト 0）なら、スコア欄の下の差分（+3365）が EX と一致する裏付けになる", () => {
    const r = decideExScore({ notes: 1787, score: [3365], diff: { value: 3365, best: 0 } });
    expect(r.value).toBe(3365);
    expect(r.ranked[0].sources).toEqual(expect.arrayContaining(["score", "diff"]));
  });

  it("範囲外（ノーツ数×2 超）・今回のランクと矛盾する値は候補から除く", () => {
    const r = decideExScore({ notes: 930, score: [9999, 1796], currentRank: "AAA" });
    expect(r.ranked.map((c) => c.value)).toEqual([1796]);
    expect(r.rejected.map((x) => x.value)).toContain(9999);
  });

  it("2 つの値が同じ重みで競合したら、確定せず ambiguous にする", () => {
    const r = decideExScore({ notes: 1800, score: [3304, 3305], judge: { pg: 1652, gr: 0 }, rankGap: { rank: "AAA", sign: "+", gap: 105 } });
    expect(r.value).toBeNull();
    expect(r.status).toBe("ambiguous");
  });

  it("読み取りが 1 つも無ければ insufficient", () => {
    expect(decideExScore({ notes: 1800 }).status).toBe("insufficient");
  });
});
