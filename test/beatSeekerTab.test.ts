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

// ティア名の中のスペースは、折り返さないための特別なスペース（U+00A0）にしているので、照合の前に普通のスペースに戻す
const render = (state: BeatSeekerPreviewState) => renderToStaticMarkup(createElement(BeatSeekerTab, { state })).replace(/ /g, " ");

describe("beat-seeker のタブ", () => {
  it("BEAT-TIER と Rate-Tier を縦に 2 段で並べ、総合 PT の差・次の段までの残り・ゲージを出す", () => {
    const html = render({ kind: "ok", preview: preview() });
    expect(html).not.toContain("grid-cols-2");
    expect(html.indexOf("BEAT-TIER")).toBeLessThan(html.indexOf("Rate-Tier"));
    expect(html).toContain("BEAT-TIER");
    expect(html).toContain("Rate-Tier");
    expect(html).toContain("+12.5 pt");
    // 16,662.5 は Master II。次は Master III（16,700）まであと 37.5
    expect(html).toContain("Master III");
    expect(html).toContain("37.5");
    // 全体の高さいっぱいに広げる
    expect(html).toContain("h-full");
  });

  it("上の数字の欄（この譜面の PT・総合の差）と重なる内容は出さない。説明や非公式難易度も出さない", () => {
    const html = render({ kind: "ok", preview: preview() });
    expect(html).not.toContain("この譜面");
    expect(html).not.toContain("非公式難易度");
    expect(html).not.toContain("登録した場合の変動");
    expect(html).not.toContain("139.51");
    expect(html).not.toContain("140.2");
  });

  it("段が上がったときは、「Veteran II → III」と短く出す。ティア名が変わるときは、全部を出す", () => {
    expect(render({ kind: "ok", preview: preview({ ratePt: pt(520, 530, ["Veteran II", "Veteran III"]) }) })).toContain("Veteran II → III");
    expect(render({ kind: "ok", preview: preview({ ratePt: pt(695, 730, ["Veteran V", "Commander I"]) }) })).toContain("Veteran V → Commander I");
  });

  it("前の記録がない（初めて）でも描ける。最上位（Legend）・最下位（Beginner）も描ける", () => {
    expect(() => render({ kind: "ok", preview: preview({ beatPt: pt(null, 9000, [null, "Beginner"]) }) })).not.toThrow();
    const legend = render({ kind: "ok", preview: preview({ beatPt: pt(18000, 18100, ["Legend", "Legend"]) }) });
    expect(legend).toContain("最上位のティア");
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
