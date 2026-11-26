import { describe, expect, it } from "vitest";
import { bestRankNotation, chartRankBorders, djRankPair } from "@/lib/domain/djRank";

describe("DJ ランクの境界と表記（BPIM2 本体と同じ）", () => {
  it("境界は満点 × 比率の切り上げ（A=6/9・AA=7/9・AAA=8/9・MAX-=17/18）", () => {
    expect(chartRankBorders(1000)).toEqual([
      { label: "A", score: 667 },
      { label: "AA", score: 778 },
      { label: "AAA", score: 889 },
      { label: "MAX-", score: 945 },
    ]);
  });

  it("AAA 帯: 現在は AAA+（AAA 境界からの超過）、次は MAX-（満点までの不足）", () => {
    expect(djRankPair(900, 1000)).toEqual({ current: "AAA+11", next: "MAX-100" });
  });

  it("MAX- 帯: 現在は MAX-（満点までの不足）、次は AAA+（AAA 境界からの超過）", () => {
    expect(djRankPair(980, 1000)).toEqual({ current: "MAX-20", next: "AAA+91" });
  });

  it("それより下は、現在のランクからの超過と、次のランクまでの不足", () => {
    expect(djRankPair(800, 1000)).toEqual({ current: "AA+22", next: "AAA-89" });
  });

  it("シェアの表記: AAA 以上は MAX-n だけ、それより下は「いまのランク+n / 次のランク-nnn」", () => {
    expect(bestRankNotation(900, 1000)).toBe("MAX-100");
    expect(bestRankNotation(980, 1000)).toBe("MAX-20");
    expect(bestRankNotation(1000, 1000)).toBe("MAX-0");
    expect(bestRankNotation(800, 1000)).toBe("AA+22 / AAA-89");
    expect(bestRankNotation(700, 1000)).toBe("A+33 / AA-78");
  });
});
