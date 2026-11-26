import { describe, expect, it, vi } from "vitest";
import { fetchBpi } from "@/lib/bpi/client";
import { calcExScore, initialBpiStatus, verifyExScore, verifyJudgeTotal } from "@/lib/domain/score";
import { matchChart } from "@/lib/songs/matcher";
import { buildShareText } from "@/lib/share/text";
import { heartache, master, record } from "./fixtures";

describe("score", () => {
  it("サンプル1枚目の検算が合う（867×2+62=1796, 判定合計=930）", () => {
    const j = { pgreat: 867, great: 62, good: 1, bad: 0, poor: 0, fast: 37, slow: 26 };
    expect(calcExScore(j)).toBe(1796);
    expect(verifyExScore(1796, j)).toBe(true);
    expect(verifyExScore(2365, j)).toBe(false);
    expect(verifyJudgeTotal(j, 930)).toBe(true);
  });

  it("☆10以下は算出対象外、☆11/12 は算出待ち", () => {
    expect(initialBpiStatus(10)).toBe("unsupported-level");
    expect(initialBpiStatus(1)).toBe("unsupported-level");
    expect(initialBpiStatus(11)).toBe("pending");
    expect(initialBpiStatus(12)).toBe("pending");
  });
});

describe("fetchBpi", () => {
  it("☆10 は API を呼ばず対象外を返す", async () => {
    const fetchImpl = vi.fn();
    const out = await fetchBpi({ chart: record().chart, exScore: 1796, version: "33", fetchImpl });
    expect(out).toEqual({ status: "unsupported-level", bpi: null, estimatedRank: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("☆12 は算出し、ノーツ数不一致は error", async () => {
    const chart = { ...record().chart, level: 12, notes: 1774, title: "UNDO THE NIGHT" };
    const ok = (notes: number) =>
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ song: { title: "UNDO THE NIGHT", notes }, bpi: 61.5, rank: { estimatedRank: 120 } }),
      });
    expect(await fetchBpi({ chart, exScore: 3365, version: "33", fetchImpl: ok(1774) })).toEqual({
      status: "calculated",
      bpi: 61.5,
      estimatedRank: 120,
    });
    expect((await fetchBpi({ chart, exScore: 3365, version: "33", fetchImpl: ok(1700) })).status).toBe("error");
  });

  it("通信失敗は pending（復帰後に再計算）", async () => {
    const chart = { ...record().chart, level: 12 };
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    expect((await fetchBpi({ chart, exScore: 1, version: "33", fetchImpl })).status).toBe("pending");
  });
});

describe("matchChart", () => {
  it("ノーツ数まで揃えば曲名なしで1件に確定する", () => {
    const out = matchChart(master, {
      playStyle: "SP",
      difficulty: "ANOTHER",
      level: 10,
      notes: 930,
      titleText: null,
    });
    expect(out.confident).toBe(true);
    expect(out.candidates[0].entry).toEqual(heartache);
  });

  it("同条件が複数なら曲名の類似度で決める（OCR 誤りに耐える）", () => {
    const out = matchChart(master, {
      playStyle: "SP",
      difficulty: "ANOTHER",
      level: 12,
      notes: null,
      titleText: "Roomy and The Boost",
    });
    expect(out.candidates[0].entry.title).toBe("Boomy and The Boost");
  });

  it("絞り切れず曲名もないときは確定せず候補を返す", () => {
    const out = matchChart(master, { playStyle: "SP", difficulty: "HYPER", level: 10, notes: 800, titleText: null });
    expect(out.confident).toBe(false);
    expect(out.candidates).toHaveLength(2);
  });
});

describe("buildShareText", () => {
  it("☆10 は BPI 行を出さずにシェア本文を作れる", () => {
    const text = buildShareText(record({ bestExScore: 0 }));
    expect(text).toContain("HEARTACHE [SPA☆10]");
    expect(text).toContain("EX 1796（更新 +1796） AAA");
    expect(text).not.toMatch(/^BPI /m);
    expect(text).toContain("FULLCOMBO / BP 0");
    expect(text).toContain("PG 867 / GR 62 / GD 1 / BD 0 / PR 0");
  });

  it("算出済みなら BPI 行を載せる", () => {
    const text = buildShareText(record({ bpi: 55.123, bpiStatus: "calculated" }));
    expect(text).toContain("BPI 55.12");
  });
});
