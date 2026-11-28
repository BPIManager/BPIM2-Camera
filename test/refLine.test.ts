import { describe, expect, it } from "vitest";
import { defaultRefChoice, isRefChoice, refLineFor } from "@/lib/bpi/refLine";

const arena = { A1: { avgExScore: 2450.4 }, A3: { avgExScore: 2100 } };

describe("参照線の選択", () => {
  it("既定: 保存された選択 > 自分のアリーナランクの平均 > 出さない", () => {
    expect(defaultRefChoice("rival-top", "A1", arena)).toBe("rival-top");
    expect(defaultRefChoice(null, "A1", arena)).toBe("A1");
    // ランクの平均が取れない曲は、線を出さない
    expect(defaultRefChoice(null, "A2", arena)).toBe("none");
    expect(defaultRefChoice(null, null, undefined)).toBe("none");
    // 壊れた保存値・昔の「自己歴代」の選択（いまは棒で常に出す）は無視する
    expect(defaultRefChoice("bogus", null, undefined)).toBe("none");
    expect(defaultRefChoice("personal-best", null, undefined)).toBe("none");
  });

  it("選択肢の判定", () => {
    expect(["none", "rival-avg", "rival-top", "A1", "A5"].every(isRefChoice)).toBe(true);
    expect(isRefChoice("personal-best")).toBe(false);
    expect(isRefChoice("A6")).toBe(false);
    expect(isRefChoice(null)).toBe(false);
  });

  it("参照線のスコア: アリーナ平均は四捨五入、ライバルは平均とトップ", () => {
    const ctx = { arenaAverages: arena, rivalScores: [2000, 2200, 1800] };
    expect(refLineFor("A1", ctx)).toEqual({ label: "A1平均", score: 2450 });
    expect(refLineFor("rival-avg", ctx)).toEqual({ label: "ライバル平均", score: 2000 });
    expect(refLineFor("rival-top", ctx)).toEqual({ label: "ライバルトップ", score: 2200 });
    expect(refLineFor("none", ctx)).toBeNull();
  });

  it("データがなければ線を出さない（アリーナ平均なし・ライバルなし・取得前）", () => {
    expect(refLineFor("A2", { arenaAverages: arena, rivalScores: [] })).toBeNull();
    expect(refLineFor("rival-avg", { rivalScores: [] })).toBeNull();
    expect(refLineFor("rival-top", { rivalScores: null })).toBeNull();
  });
});
