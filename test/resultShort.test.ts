import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BpiChart from "@/features/result/BpiChart";
import ResultChips from "@/features/result/ResultChips";
import DifficultyBadge, { chartCode } from "@/components/ui/difficulty-badge";
import { LAMPS, lampShort, optionShort } from "@/lib/result/shortCodes";
import { barIndexAt, tipFor } from "@/lib/bpi/chartTip";

describe("譜面の短い表記", () => {
  it("SPB・SPN・SPH・SPA・SPL（DP も同じ）", () => {
    expect(chartCode("SP", "BEGINNER")).toBe("SPB");
    expect(chartCode("SP", "NORMAL")).toBe("SPN");
    expect(chartCode("SP", "HYPER")).toBe("SPH");
    expect(chartCode("SP", "ANOTHER")).toBe("SPA");
    expect(chartCode("SP", "LEGGENDARIA")).toBe("SPL");
    expect(chartCode("DP", "ANOTHER")).toBe("DPA");
  });

  it("バッジは「SPL ☆12」。正式名は読み上げに残す", () => {
    const html = renderToStaticMarkup(createElement(DifficultyBadge, { playStyle: "SP", difficulty: "LEGGENDARIA", level: 12 }));
    expect(html).toContain("SPL ☆12");
    expect(html).toContain('aria-label="SP LEGGENDARIA ☆12"');
  });
});

describe("クリアランプ・使用オプションの短い名前", () => {
  it("ランプ：FL・AS・EC・CL・HC・EXH・FC。未選択・NO PLAY は —", () => {
    expect(LAMPS.map((l) => `${l.value}=${l.short}`)).toEqual([
      "FAILED=FL",
      "ASSIST CLEAR=AS",
      "EASY CLEAR=EC",
      "CLEAR=CL",
      "HARD CLEAR=HC",
      "EX HARD CLEAR=EXH",
      "FULLCOMBO CLEAR=FC",
    ]);
    expect(lampShort(null)).toBe("—");
    expect(lampShort("NO PLAY")).toBe("—");
    expect(lampShort("HARD CLEAR")).toBe("HC");
  });

  it("オプション：R・RR・SR・HR・MR。OFF やほかの名前はそのまま。DP の組は左右それぞれ短くする", () => {
    expect(optionShort("RANDOM")).toBe("R");
    expect(optionShort("R-RANDOM")).toBe("RR");
    expect(optionShort("S-RANDOM")).toBe("SR");
    expect(optionShort("H-RANDOM")).toBe("HR");
    expect(optionShort("MIRROR")).toBe("MR");
    expect(optionShort("OFF")).toBe("OFF");
    expect(optionShort("SYNC-RANDOM")).toBe("SYNC-RANDOM");
    expect(optionShort("RAN / MIR")).toBe("R / MR");
  });

  it("ヘッダーの欄は、閉じているときは短い名前で、全部の名前は選択肢に出す", () => {
    const html = renderToStaticMarkup(
      createElement(ResultChips, { clearType: "HARD CLEAR", onClearType: () => undefined, useOption: "S-RANDOM", onUseOption: () => undefined, counts: { missCount: "3" }, onCount: () => undefined }),
    );
    expect(html).toContain(">HC<");
    expect(html).toContain(">SR<");
    expect(html).toContain("OP");
    expect(html).toContain('value="3"');
    expect(html).toContain("EX HARD CLEAR");
    expect(html).toContain("H-RANDOM");
  });
});

describe("チャートの自己歴代（BEST のゴースト）", () => {
  const curve = [100, 80, 60, 40, 20, 0].map((bpi, i) => ({ bpi, score: 3000 - i * 300 }));
  const render = (best: number | null) => renderToStaticMarkup(createElement(BpiChart, { curve, exScore: 2500, maxScore: 3600, best }));

  it("自己歴代があれば、BEST の棒（点線）をスコアの順の位置に置く。なければ出さない", () => {
    const html = render(2700);
    expect(html).toContain(">BEST<");
    expect(html).toContain('stroke-dasharray="3 2"');
    expect(render(null)).not.toContain("BEST");
  });

  it("自己歴代が今回と同じなら、YOU の次に並べる", () => {
    const html = render(2500);
    expect(html.indexOf(">YOU<")).toBeLessThan(html.indexOf(">BEST<"));
  });
});

describe("チャートのツールチップ", () => {
  const bar = (label: string, score: number, extra: object = {}) => ({ label, score, you: false, ...extra });

  it("BPI の棒：必要スコアと、今回との差（高ければ「あと」、今回が上なら「上回る」、同じなら「同点」）", () => {
    expect(tipFor(bar("60", 2340), 2300, null)).toEqual({
      title: "BPI 60",
      lines: [
        { text: "必要スコア 2,340", tone: "muted" },
        { text: "BPI 60まで あと 40", tone: "up" },
      ],
    });
    expect(tipFor(bar("60", 2340), 2400, null).lines[1]).toEqual({ text: "BPI 60を 60 上回る", tone: "down" });
    expect(tipFor(bar("60", 2340), 2340, null).lines[1]).toEqual({ text: "BPI 60と同点", tone: "muted" });
  });

  it("BEST（自己歴代）：バージョンを出す。バージョンが分からなければ出さない", () => {
    expect(tipFor(bar("BEST", 2700, { ghost: true }), 2500, "33").title).toBe("自己歴代（33）");
    expect(tipFor(bar("BEST", 2700, { ghost: true }), 2500, null).title).toBe("自己歴代");
    expect(tipFor(bar("BEST", 2700, { ghost: true }), 2500, "33").lines[1]).toEqual({ text: "自己歴代まで あと 200", tone: "up" });
    expect(tipFor(bar("BEST", 2400, { ghost: true }), 2500, "33").lines[1]).toEqual({ text: "自己歴代を 100 上回る", tone: "down" });
  });

  it("YOU：今回のスコア", () => {
    expect(tipFor(bar("YOU", 2500, { you: true }), 2500, null)).toEqual({ title: "YOU（今回）", lines: [{ text: "スコア 2,500", tone: "muted" }] });
  });
});

describe("指の位置から棒を決める", () => {
  // 幅 340、左右の余白 8、棒 12 本 → 1 本の枠は 27
  const box = { left: 100, width: 340 };

  it("棒の枠ごとに、その棒の番号。なぞると、隣の棒に移る", () => {
    expect(barIndexAt(100 + 8 + 5, box, 12, 8)).toBe(0);
    expect(barIndexAt(100 + 8 + 26, box, 12, 8)).toBe(0);
    expect(barIndexAt(100 + 8 + 27, box, 12, 8)).toBe(1);
    expect(barIndexAt(100 + 8 + 27 * 6 + 1, box, 12, 8)).toBe(6);
  });

  it("余白や端の外は、いちばん近い棒にする。棒がなければ -1", () => {
    expect(barIndexAt(0, box, 12, 8)).toBe(0);
    expect(barIndexAt(100 + 3, box, 12, 8)).toBe(0);
    expect(barIndexAt(100 + 338, box, 12, 8)).toBe(11);
    expect(barIndexAt(9999, box, 12, 8)).toBe(11);
    expect(barIndexAt(150, box, 0, 8)).toBe(-1);
  });
});
