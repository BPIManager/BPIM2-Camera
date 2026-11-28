import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BeatSeekerTab from "@/features/result/BeatSeekerTab";
import type { BeatSeekerPreview, PtChange } from "@/lib/beatSeeker/client";
import type { BeatSeekerPreviewState } from "@/features/result/BeatSeekerPreview";

const pt = (before: number | null, after: number | null, tier: [string | null, string | null], chart: PtChange["chart"] = null): PtChange => ({
  chart,
  total: { before, after, delta: before !== null && after !== null ? Math.round((after - before) * 100) / 100 : null },
  tier: { before: tier[0], after: tier[1] },
});

const preview = (over: Partial<BeatSeekerPreview> = {}): BeatSeekerPreview => ({
  chart: { title: "冥", level: 12, unofficialLevel: "12.8" },
  improved: { exScore: true, clearType: false, missCount: false },
  willUpdate: true,
  beatPt: pt(16650, 16662.5, ["Master II", "Master II"], { before: 139.51, after: 140.2 }),
  ratePt: pt(500, 530, ["Veteran II", "Veteran III"]),
  ...over,
});

const render = (state: BeatSeekerPreviewState) => renderToStaticMarkup(createElement(BeatSeekerTab, { state }));

describe("beat-seeker のタブ", () => {
  it("右上に総合 BEAT-PT の差、ティアごとのカード（変動・次の段までの残り・ゲージ）を出す", () => {
    const html = render({ kind: "ok", preview: preview() });
    expect(html).toContain("+12.5");
    expect(html).toContain("BEAT-TIER");
    expect(html).toContain("Rate-Tier");
    // 16,662.5 は Master II。次は Master III（16,700）まであと 37.5
    expect(html).toContain("Master III");
    expect(html).toContain("37.5");
    expect(html).toContain("非公式難易度 12.8");
    expect(html).toContain("BEAT-PT（この譜面）");
  });

  it("ティアが上がったときは、前 → 後と「ティアアップ」を出す", () => {
    const html = render({ kind: "ok", preview: preview({ ratePt: pt(520, 530, ["Veteran II", "Veteran III"]) }) });
    expect(html).toContain("ティアアップ");
    expect(html).toContain("Veteran III");
  });

  it("前の記録がない（初めて）でも描ける。最上位（Legend）・最下位（Beginner）も描ける", () => {
    expect(() => render({ kind: "ok", preview: preview({ beatPt: pt(null, 9000, [null, "Beginner"]) }) })).not.toThrow();
    const legend = render({ kind: "ok", preview: preview({ beatPt: pt(18000, 18100, ["Legend", "Legend"]) }) });
    expect(legend).toContain("最上位のティアです");
    const none = render({ kind: "ok", preview: preview({ beatPt: pt(null, null, [null, null]), ratePt: pt(null, null, [null, null]) }) });
    expect(none).toContain("—");
  });

  it("記録が伸びないときは、その旨を出す", () => {
    expect(render({ kind: "ok", preview: preview({ willUpdate: false }) })).toContain("記録が伸びないため");
  });

  it("連携していない・登録できない・ランプなし・取得に失敗したときの案内", () => {
    expect(render({ kind: "off" })).toContain("連携すると");
    expect(render({ kind: "unsupported" })).toContain("SP の最新バージョン");
    expect(render({ kind: "need-lamp" })).toContain("クリアランプを選ぶと");
    expect(render({ kind: "failed", result: { kind: "rejected", code: "CHART_NOT_FOUND", message: "x" } })).toContain("見つかりませんでした");
    expect(render({ kind: "failed", result: { kind: "invalid" } })).toContain("トークンが無効");
    expect(render({ kind: "failed", result: { kind: "rate-limited" } })).toContain("回数制限");
    expect(render({ kind: "failed", result: null })).toContain("接続できませんでした");
    expect(render({ kind: "loading" })).toContain("確かめています");
  });
});
