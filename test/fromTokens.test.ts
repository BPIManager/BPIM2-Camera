import { describe, expect, it } from "vitest";
import { rawFromTokens } from "@/lib/recognition/fromTokens";
import { resolveResult } from "@/lib/recognition/resolve";
import { solveJudge } from "@/lib/recognition/solve";
import { parseChartHints, type OcrToken } from "@/lib/recognition/tokens";
import { master } from "./fixtures";

const toks = (...t: string[]): OcrToken[] => t.map((text) => ({ text, confidence: 90 }));

describe("parseChartHints", () => {
  it("難易度・レベル・ノーツ数を OCR の取り違え込みで読む", () => {
    expect(parseChartHints(toks("ANOTHER 1O", "SP", "O93O NOTES"))).toEqual({
      playStyle: "SP",
      difficulty: "ANOTHER",
      level: 10,
      notes: 930,
    });
  });
});

describe("solveJudge", () => {
  it("サンプル1枚目: 判定の合計がノーツ数に一致する組を解き、EX 1796 を裏付ける", () => {
    const [best] = solveJudge([867, 62, 1, 37, 26, 1796, 0], 930);
    expect(best.exScore).toBe(1796);
    expect(best.crossChecked).toBe(true);
    expect(best.judge).toMatchObject({ pgreat: 867, great: 62, good: 1 });
  });
});

describe("rawFromTokens + resolveResult", () => {
  it("読めたトークンだけで曲・EX まで確認なしで確定する", () => {
    const raw = rawFromTokens(toks("HEARTACHE", "ANOTHER 10", "0930 NOTES", "867", "62", "1", "1796", "37", "26"), master);
    expect(raw).not.toBeNull();
    const r = resolveResult(raw!, master);
    expect(r.autoConfirm).toBe(true);
    expect(r.exScore).toBe(1796);
    expect(r.chart?.title).toBe("HEARTACHE");
  });

  it("EX が裏付けられないときは確定せず候補を返す（手入力の前段）", () => {
    const raw = rawFromTokens(toks("HEARTACHE", "ANOTHER 10", "0930 NOTES", "1796", "26"), master);
    const r = resolveResult(raw!, master);
    expect(r.autoConfirm).toBe(false);
    expect(raw!.exCandidates).toContain(1796);
  });

  it("何も読めなければ null（手入力へ）", () => {
    expect(rawFromTokens(toks("@@", "~"), master)).toBeNull();
  });
});

describe("誤確定の防止", () => {
  it("ノーツ数の表記（1857 NOTES）を EX と取り違えて確定しない", () => {
    const raw = rawFromTokens(toks("Lost Summer", "1857", "NOTES", "2891"), master);
    expect(raw?.exScore.value ?? null).toBeNull();
  });
});
