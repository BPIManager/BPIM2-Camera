import { describe, expect, it } from "vitest";
import { defaultRefChoice, isRefChoice, refLineFor } from "@/lib/bpi/refLine";

const arena = { A1: { avgExScore: 2450.4 }, A3: { avgExScore: 2100 } };

describe("参照線の選択", () => {
  it("既定: 保存された選択 > 自分のアリーナランクの平均 > 自己歴代", () => {
    expect(defaultRefChoice("rival-top", "A1", arena)).toBe("rival-top");
    expect(defaultRefChoice(null, "A1", arena)).toBe("A1");
    // ランクの平均が取れない曲は自己歴代にする
    expect(defaultRefChoice(null, "A2", arena)).toBe("personal-best");
    expect(defaultRefChoice(null, null, undefined)).toBe("personal-best");
    // 壊れた保存値は無視する
    expect(defaultRefChoice("bogus", null, undefined)).toBe("personal-best");
  });

  it("選択肢の判定", () => {
    expect(["none", "personal-best", "rival-avg", "rival-top", "A1", "A5"].every(isRefChoice)).toBe(true);
    expect(isRefChoice("A6")).toBe(false);
    expect(isRefChoice(null)).toBe(false);
  });

  it("参照線のスコア: アリーナ平均は四捨五入、ライバルは平均とトップ、自己歴代は自己ベスト", () => {
    const ctx = { arenaAverages: arena, best: 1980, rivalScores: [2000, 2200, 1800] };
    expect(refLineFor("A1", ctx)).toEqual({ label: "A1平均", score: 2450 });
    expect(refLineFor("rival-avg", ctx)).toEqual({ label: "ライバル平均", score: 2000 });
    expect(refLineFor("rival-top", ctx)).toEqual({ label: "ライバルトップ", score: 2200 });
    expect(refLineFor("personal-best", ctx)).toEqual({ label: "自己歴代", score: 1980 });
    expect(refLineFor("none", ctx)).toBeNull();
  });

  it("データがなければ線を出さない（アリーナ平均なし・記録なし・ライバルなし・取得前）", () => {
    expect(refLineFor("A2", { arenaAverages: arena, best: null, rivalScores: [] })).toBeNull();
    expect(refLineFor("personal-best", { best: null, rivalScores: null })).toBeNull();
    expect(refLineFor("rival-avg", { best: 1, rivalScores: [] })).toBeNull();
    expect(refLineFor("rival-top", { best: 1, rivalScores: null })).toBeNull();
  });
});
