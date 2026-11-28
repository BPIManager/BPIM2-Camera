import { describe, expect, it } from "vitest";
import { BEAT_TIERS, RATE_TIERS, compactTierChange, locate, roman } from "@/lib/beatSeeker/tiers";

describe("BEAT-TIER のしきい値", () => {
  it("段の下限は、表のとおり（Novice は 400 刻み、Intermediate〜Expert は 200 刻み、Veteran 以上は 100 刻み）", () => {
    const steps = (name: string) => BEAT_TIERS.tiers.find((t) => t.name === name)!.steps;
    expect(steps("Novice")).toEqual([10000, 10400, 10800, 11200, 11600]);
    expect(steps("Intermediate")).toEqual([12000, 12200, 12400, 12600, 12800]);
    expect(steps("Expert")).toEqual([14000, 14200, 14400, 14600, 14800]);
    expect(steps("Veteran")).toEqual([15000, 15100, 15200, 15300, 15400]);
    expect(steps("Mythic")).toEqual([17500, 17600, 17700, 17800, 17900]);
  });

  it("ポイントから、ティア・段・次の段までの残りを求める", () => {
    const p = locate(BEAT_TIERS, 16650);
    expect(p.label).toBe("Master II");
    expect(p.bandFloor).toBe(16500);
    expect(p.bandCeil).toBe(17000);
    expect(p.next).toEqual({ label: "Master III", at: 16700 });
    expect(p.remaining).toBe(50);
  });

  it("段の境目は、その段に入る（ちょうど 16,600 は II）", () => {
    expect(locate(BEAT_TIERS, 16600).label).toBe("Master II");
    expect(locate(BEAT_TIERS, 16599.99).label).toBe("Master I");
  });

  it("最後の段（V）の次は、次のティアの I。Legend の次はない", () => {
    const p = locate(BEAT_TIERS, 16950);
    expect(p.label).toBe("Master V");
    expect(p.next).toEqual({ label: "Ancient I", at: 17000 });
    expect(p.remaining).toBe(50);
    const legend = locate(BEAT_TIERS, 18500);
    expect(legend.label).toBe("Legend");
    expect(legend.next).toBeNull();
    expect(legend.remaining).toBeNull();
    expect(legend.bandCeil).toBeNull();
  });

  it("Beginner は段がなく、次は Novice I", () => {
    const p = locate(BEAT_TIERS, 9000);
    expect(p.label).toBe("Beginner");
    expect(p.step).toBeNull();
    expect(p.next).toEqual({ label: "Novice I", at: 10000 });
    expect(p.remaining).toBe(1000);
    expect(locate(BEAT_TIERS, 0).label).toBe("Beginner");
  });
});

describe("Rate-Tier のしきい値", () => {
  it("ティアの下限は 2 倍ずつ。ティアの中の 5 段は等比で、表の数字と合う", () => {
    const steps = (name: string) => RATE_TIERS.tiers.find((t) => t.name === name)!.steps;
    expect(steps("Mythic").map((v) => Math.round(v / 100) / 10)).toEqual([12.8, 14.7, 16.9, 19.4, 22.3]);
    [400, 459.5, 527.8, 606.3, 696.4].forEach((v, i) => expect(steps("Veteran")[i]).toBeCloseTo(v, 0));
    [25, 28.7, 33, 37.9, 43.5].forEach((v, i) => expect(steps("Novice")[i]).toBeCloseTo(v, 0));
    expect(RATE_TIERS.tiers.at(-1)).toMatchObject({ name: "Legend", floor: 25600 });
  });

  it("ポイントから、ティア・段・次の段までの残りを求める", () => {
    const p = locate(RATE_TIERS, 500);
    expect(p.label).toBe("Veteran II");
    expect(p.next?.label).toBe("Veteran III");
    expect(p.remaining).toBeCloseTo(27.8, 0);
    expect(locate(RATE_TIERS, 24).label).toBe("Beginner");
    expect(locate(RATE_TIERS, 25).label).toBe("Novice I");
    expect(locate(RATE_TIERS, 30000).label).toBe("Legend");
  });
});

describe("段の表記", () => {
  it("1〜5 を I〜V にする", () => {
    expect([1, 2, 3, 4, 5].map(roman)).toEqual(["I", "II", "III", "IV", "V"]);
  });
});

describe("ティアの変動の短い表記", () => {
  it("同じティア名の中の段の変化は、段だけにする。ティア名が変わるときは全部出す。変わらなければ、いまのティアだけ", () => {
    expect(compactTierChange("Master II", "Master III")).toBe("Master II → III");
    expect(compactTierChange("Master V", "Ancient I")).toBe("Master V → Ancient I");
    expect(compactTierChange("Master II", "Master II")).toBe("Master II");
    expect(compactTierChange("Beginner", "Novice I")).toBe("Beginner → Novice I");
    expect(compactTierChange("Mythic V", "Legend")).toBe("Mythic V → Legend");
  });

  it("前が分からなければ、いまのティアだけ。どちらも分からなければ null", () => {
    expect(compactTierChange(null, "Master II")).toBe("Master II");
    expect(compactTierChange("Master II", null)).toBe("Master II");
    expect(compactTierChange(null, null)).toBeNull();
  });
});
