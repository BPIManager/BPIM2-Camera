import { describe, expect, it } from "vitest";
import { ptLines } from "@/lib/share/text";
import type { BeatSeekerPreview } from "@/lib/beatSeeker/client";

const pt = (chart: [number, number] | null, total: [number, number]) => ({
  chart: chart ? { before: chart[0], after: chart[1] } : null,
  total: { before: total[0], after: total[1], delta: total[1] - total[0] },
  tier: { before: null, after: null },
});

describe("ptLines", () => {
  it("BEAT-PT と Rate-PT の、単曲と総合の変動を出す", () => {
    const p = { beatPt: pt([1200, 1250], [10000, 10012.5]), ratePt: pt(null, [400, 400]) } as unknown as BeatSeekerPreview;
    expect(ptLines(p)).toEqual([
      "BEAT-PT: 単曲 1,200 → 1,250 / 総合 10,000 → 10,012.5 (+12.5)",
      "Rate-PT: 総合 400 → 400 (±0)",
    ]);
  });
});
