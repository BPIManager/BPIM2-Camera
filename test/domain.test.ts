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
        json: async () => ({ error: false, body: { song: { title: "UNDO THE NIGHT", notes }, bpi: 61.5, rank: { estimatedRank: 120 } } }),
      });
    expect(await fetchBpi({ chart, exScore: 3365, version: "33", fetchImpl: ok(1774) })).toEqual({
      status: "calculated",
      bpi: 61.5,
      estimatedRank: 120,
    });
    expect((await fetchBpi({ chart, exScore: 3365, version: "33", fetchImpl: ok(1700) })).status).toBe("error");
  });

  it("v2 のエンベロープから、曲線とアリーナ平均も取り出す", async () => {
    const chart = { ...record().chart, level: 12, notes: 1774, title: "UNDO THE NIGHT" };
    const curve = [{ bpi: 100, score: 3000 }, { bpi: 0, score: 2400 }];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        error: false,
        body: { song: { title: "UNDO THE NIGHT", notes: 1774 }, bpi: 10, rank: { estimatedRank: 5 }, curve, metadata: { arenaAverages: { A1: { avgExScore: 2900 } } } },
      }),
    });
    const out = await fetchBpi({ chart, exScore: 2500, version: "34", fetchImpl });
    expect(out.curve).toEqual(curve);
    expect(out.arenaAverages).toEqual({ A1: { avgExScore: 2900 } });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("includeCurve=true");
  });

  it("エンベロープが error のときは error", async () => {
    const chart = { ...record().chart, level: 12 };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: true, errorMessage: "x", body: null }) });
    expect((await fetchBpi({ chart, exScore: 1, version: "34", fetchImpl })).status).toBe("error");
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
  it("☆12 楽曲名[SPA] / EX: nnnn (MAX-nnn) / BPI: nn.nn / 推定順位: nn位 の 2 行", () => {
    const r = record({
      chart: { ...record().chart, title: "UNDO THE NIGHT", level: 12, notes: 1000, difficulty: "ANOTHER", playStyle: "SP" },
      exScore: 1950,
      bpi: 55.123,
      bpiStatus: "calculated",
      estimatedRank: 120,
    });
    expect(buildShareText(r)).toBe("☆12 UNDO THE NIGHT[SPA]\nEX: 1950 (MAX-50) / BPI: 55.12 / 推定順位: 120位");
  });

  it("BPI や推定順位が出せないときは、その項目を省く（☆10 以下は BPI 算出対象外）", () => {
    const r = record({ exScore: 1796, bpi: null, bpiStatus: "unsupported-level", estimatedRank: null });
    expect(buildShareText(r)).toBe("☆10 HEARTACHE[SPA]\nEX: 1796 (MAX-64)");
  });

  it("AAA 未満は、現在のランクからの超過と次のランクまでの距離（A+n / AA-nnn）で表す", () => {
    const r = record({ exScore: 1500, bpi: null, bpiStatus: "unsupported-level" });
    // 満点 1860（930 ノーツ）の AA 帯: AA 境界 1447 からの超過 53、AAA 境界 1654 までの距離 154
    expect(buildShareText(r)).toContain("EX: 1500 (AA+53 / AAA-154)");
  });
});
