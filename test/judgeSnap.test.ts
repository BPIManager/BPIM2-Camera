import { describe, expect, it } from "vitest";
import { judgeSearchArea, overlap, snapJudgeFrame } from "@/lib/vision/judgeSnap";
import type { OcrLine } from "@/lib/recognition/paddle/engine";

const line = (text: string, x: number, y: number, width = 60, height = 10): OcrLine => ({ text, confidence: 80, box: { x, y, width, height } });

describe("judgeSearchArea", () => {
  it("枠の左に幅 1 つ分・上下に高さの 0.6 倍・右に幅の 0.4 倍広げ、表示の外は切る", () => {
    expect(judgeSearchArea({ x: 200, y: 100, width: 100, height: 50 }, { width: 1000, height: 1000 })).toEqual({ x: 100, y: 70, width: 240, height: 110 });
    expect(judgeSearchArea({ x: 50, y: 10, width: 100, height: 50 }, { width: 160, height: 1000 }).x).toBe(0);
  });
});

describe("snapJudgeFrame", () => {
  it("見出しの左端と文字の高さから、数字の列を囲む枠を決める（読んだ画像 → 表示の座標）", () => {
    // 読んだ画像は表示の 2 倍の大きさ（area は表示の座標で幅 100、画像は幅 200）
    const area = { x: 10, y: 20, width: 100, height: 100 };
    const lines = [line("GREAT", 20, 40, 50, 10), line("GREAT 175", 20, 60, 90, 10), line("GOOD", 20, 80, 40, 10), line("BAD", 20, 100), line("POOR", 20, 120)];
    const r = snapJudgeFrame(lines, area, { width: 200, height: 200 })!;
    // h = 10 × 0.5 = 5。左端 = 10 + 20 × 0.5 = 20
    expect(r.x).toBeCloseTo(20 + 2.55 * 5);
    expect(r.width).toBeCloseTo((10.46 - 2.55) * 5);
    // 上端 = 20 + 40 × 0.5 = 40、下端 = 20 + 130 × 0.5 = 85
    expect(r.y).toBeCloseTo(40 - 1.47 * 5);
    expect(r.height).toBeCloseTo(45 + (1.11 + 1.47) * 5);
  });
  it("見出しが 2 つ未満なら合わせ直さない", () => {
    expect(snapJudgeFrame([line("GREAT", 0, 0), line("1566", 80, 0)], { x: 0, y: 0, width: 100, height: 100 }, { width: 100, height: 100 })).toBeNull();
  });
});

describe("overlap", () => {
  it("IoU", () => {
    expect(overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(1);
    expect(overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 })).toBeCloseTo(50 / 150);
    expect(overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 10, height: 10 })).toBe(0);
  });
});
