import { describe, expect, it } from "vitest";
import { chartResolvedByHints, rawFromRegions } from "@/lib/recognition/fromRegions";
import { resolveResult } from "@/lib/recognition/resolve";
import { voteScore } from "@/lib/recognition/scoreVote";
import { GUIDE_LAYOUTS, guideRects } from "@/lib/vision/guides";
import type { OcrToken } from "@/lib/recognition/tokens";
import { master } from "./fixtures";

const toks = (...t: string[]): OcrToken[] => t.map((text) => ({ text, confidence: 90 }));

describe("voteScore", () => {
  it("2 回以上一致した範囲内の値を採用し、差分(+3365)や範囲外は無視する", () => {
    const v = voteScore([["3365", "4"], ["3365", "0"], ["2365"]], 1774);
    expect(v.value).toBe(3365);
  });

  it("一致が 1 回だけなら確定せず候補を返す", () => {
    const v = voteScore([["3365"], ["2365"]], 1774);
    expect(v.value).toBeNull();
    expect(v.candidates).toEqual(expect.arrayContaining([3365, 2365]));
  });

  it("ノーツ数×2 を超える値は候補にも入れない", () => {
    expect(voteScore([["9999"], ["9999"]], 930).candidates).toEqual([]);
  });
});

describe("rawFromRegions", () => {
  it("曲名帯とスコア枠だけで確認なしに確定する（☆10 も同じ）", () => {
    const raw = rawFromRegions(toks("HEARTACHE", "ANOTHER 10", "0930 NOTES"), [["1796"], ["1796", "0"]], master);
    const r = resolveResult(raw!, master);
    expect(r.autoConfirm).toBe(true);
    expect(r.exScore).toBe(1796);
    expect(r.chart?.level).toBe(10);
  });

  it("スコアが 1 回しか一致しなければ候補選択に回る", () => {
    const raw = rawFromRegions(toks("ANOTHER 10", "0930 NOTES"), [["1796"], ["796"]], master);
    expect(resolveResult(raw!, master).autoConfirm).toBe(false);
    expect(raw!.exCandidates).toContain(1796);
  });
});

describe("guideRects", () => {
  it("2P は 1P を左右反転した位置になる", () => {
    const view = { width: 1000, height: 2000 };
    const a = guideRects("1P", view);
    const b = guideRects("2P", view);
    expect(b.score.x).toBeCloseTo(1000 - a.score.x - a.score.width);
    expect(b.title.y).toBeCloseTo(a.title.y);
    expect(GUIDE_LAYOUTS["1P"].title.x + GUIDE_LAYOUTS["1P"].title.width).toBeCloseTo(1);
  });
});

describe("誤確定の防止（実測で見つかった条件）", () => {
  it("ノーツ数が分からないとき、1 桁の誤読が 2 回一致しても確定しない", () => {
    expect(voteScore([["1"], ["1"]], null).value).toBeNull();
  });

  it("曲の確定が弱いときは範囲で正しい EX を除外しない", () => {
    const raw = rawFromRegions(toks("Eurobeat"), [["3365"], ["12"]], master);
    expect(raw!.exCandidates).toContain(3365);
  });
});

describe("日本語の曲名", () => {
  const jpMaster = [
    ...master,
    { songId: 20, title: "フランケンシュタインの怪物", playStyle: "SP" as const, difficulty: "ANOTHER" as const, level: 9, notes: 883 },
    { songId: 21, title: "ダミー曲", playStyle: "SP" as const, difficulty: "ANOTHER" as const, level: 9, notes: 700 },
  ];

  it("日本語 OCR の文字間の空白や 1 文字の誤読があっても曲を特定する", () => {
    const raw = rawFromRegions(toks("ANOTHER 9"), [["1751"], ["1751"]], jpMaster, "フランケンシュタインの 怪 物");
    expect(resolveResult(raw!, jpMaster).chart?.title).toBe("フランケンシュタインの怪物");
    const typo = rawFromRegions(toks("ANOTHER 9"), [["1751"], ["1751"]], jpMaster, "フランケンシユタインの怪物");
    expect(resolveResult(typo!, jpMaster).chart?.songId).toBe(20);
  });

  it("難易度・レベル・ノーツ数で絞れるなら日本語 OCR は不要と判定する", () => {
    expect(chartResolvedByHints(toks("ANOTHER 9", "0883 NOTES"), jpMaster)).toBe(true);
    expect(chartResolvedByHints(toks("ANOTHER 9"), jpMaster)).toBe(false);
  });
});
