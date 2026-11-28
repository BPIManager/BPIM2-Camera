import { describe, expect, it } from "vitest";
import { radarKey, summarizeByRadar, type RadarCategory } from "@/lib/analysis/summary";
import { record } from "./fixtures";

const chart = (songId: number, title: string, playStyle: "SP" | "DP" = "SP") => ({ songId, title, playStyle, difficulty: "ANOTHER" as const, level: 12, notes: 1000 });
const top = new Map<string, RadarCategory>([
  [radarKey({ title: "A", difficulty: "ANOTHER" }), "NOTES"],
  [radarKey({ title: "B", difficulty: "ANOTHER" }), "SCRATCH"],
]);

describe("summarizeByRadar", () => {
  it("譜面の最も高いレーダーの項目ごとに、プレー数・譜面数・平均をまとめる", () => {
    const { rows, uncategorized } = summarizeByRadar(
      [
        record({ id: "1", chart: chart(1, "A"), exScore: 1800, bpi: 50, bpiStatus: "calculated", missCount: 4, fast: 60, slow: 40 }),
        record({ id: "2", chart: chart(1, "A"), exScore: 1600, bpi: 30, bpiStatus: "calculated", missCount: null, fast: null, slow: null }),
        record({ id: "3", chart: chart(2, "B"), exScore: 1500, bpi: null, bpiStatus: "pending", missCount: 10 }),
        // レーダーの項目が分からない譜面（データに無い・DP）は数えない
        record({ id: "4", chart: chart(3, "C") }),
        record({ id: "5", chart: chart(1, "A", "DP") }),
      ],
      top,
    );
    expect(uncategorized).toBe(2);
    const notes = rows.find((r) => r.category === "NOTES")!;
    expect(notes).toMatchObject({ plays: 2, charts: 1, bpi: { value: 40, n: 2 }, scoreRate: { value: expect.closeTo(0.85), n: 2 }, fastRate: { value: 0.6, n: 1 }, missCount: { value: 4, n: 1 } });
    const scratch = rows.find((r) => r.category === "SCRATCH")!;
    expect(scratch).toMatchObject({ plays: 1, bpi: null, fastRate: null, missCount: { value: 10, n: 1 } });
    // 記録のない項目も、決まった順で並べる
    expect(rows.map((r) => r.category)).toEqual(["NOTES", "CHORD", "PEAK", "CHARGE", "SCRATCH", "SOFLAN"]);
    expect(rows.find((r) => r.category === "PEAK")).toMatchObject({ plays: 0, bpi: null });
  });
});
