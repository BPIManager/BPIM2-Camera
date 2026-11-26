import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BpiChart from "@/features/result/BpiChart";

const curve = [
  { bpi: 100, score: 2500 },
  { bpi: 90, score: 2400 },
  { bpi: 80, score: 2300 },
  { bpi: 70, score: 2200 },
  { bpi: 60, score: 2100 },
  { bpi: 50, score: 2000 },
  { bpi: 40, score: 1900 },
  { bpi: 30, score: 1800 },
  { bpi: 20, score: 1700 },
  { bpi: 10, score: 1600 },
  { bpi: 0, score: 1500 },
];

const render = (props: Partial<Parameters<typeof BpiChart>[0]> = {}) =>
  renderToStaticMarkup(createElement(BpiChart, { curve, exScore: 2050, maxScore: 2728, ...props }));

describe("BpiChart", () => {
  it("BPI 100〜0 の 11 本と YOU の 1 本、合わせて 12 本の棒を描き、スコアの高い順に並べる", () => {
    const html = render();
    // 棒 12 本 + YOU の吹き出しの枠 1 つ
    expect(html.match(/<rect /g)).toHaveLength(13);
    expect(html).toContain(">YOU<");
    // YOU（2050）は BPI 50（2000）と BPI 60（2100）の間に入る
    expect(html.indexOf(">60<")).toBeLessThan(html.indexOf(">YOU<"));
    expect(html.indexOf(">YOU<")).toBeLessThan(html.indexOf(">50<"));
  });

  it("選んだ参照線を 1 本描く（範囲外・未指定は描かない）", () => {
    expect(render({ refLine: { label: "A1平均", score: 2450 } })).toContain("A1平均 2450");
    expect(render({ refLine: { label: "A9平均", score: 100 } })).not.toContain("A9平均");
    // 参照線（緑）。ランクの破線（黄）とは別
    expect(render({ refLine: null })).not.toContain("stroke-success");
    expect(render()).not.toContain("stroke-success");
    expect(render({ refLine: { label: "A1平均", score: 2450 } })).toContain("stroke-success");
  });

  it("描く範囲に入る DJ ランクの境界を、破線とラベルで描く（範囲の外のものは描かない）", () => {
    // 満点 2728: A=1819・AA=2122・AAA=2425・MAX-=2576。曲線は 1500〜2500、YOU 2050
    const html = render();
    for (const label of ["A", "AA", "AAA"]) expect(html).toContain(`>${label}<`);
    // MAX-（2576）は、いちばん高い棒（2500）の少し上の範囲を超えるので描かない
    expect(html).not.toContain(">MAX-<");
    expect(render({ exScore: 2700 })).toContain(">MAX-<");
  });

  it("YOU の吹き出しに「いまのランク / 次のランク」を、閉じずに出す（満点 2728・EX 2050 は A 帯）", () => {
    const html = render();
    expect(html).toContain(">A+231<");
    expect(html).toContain(">AA-72<");
    // AAA 帯・MAX- 帯の表記
    expect(render({ exScore: 2500 })).toContain(">AAA+75<");
    expect(render({ exScore: 2500 })).toContain(">MAX-228<");
  });

  it("YOU が右端に近くて、右に置く余地がなくても、吹き出しは描く（右上）", () => {
    expect(render({ exScore: 100 })).toContain(">F+100<");
  });

  it("満点を超えるスコアや、曲線より下のスコアでも描画が壊れない", () => {
    expect(() => render({ exScore: 99999 })).not.toThrow();
    expect(() => render({ exScore: 0 })).not.toThrow();
    expect(render({ exScore: 0 })).not.toContain("NaN");
  });
});
