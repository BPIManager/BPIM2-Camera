import { describe, expect, it } from "vitest";
import type { OcrLine } from "@/lib/recognition/paddle/engine";
import { AutoCaptureGate, REQUIRED_STREAK, screenPlausible } from "@/lib/vision/autoCapture";

const line = (text: string, confidence = 90): OcrLine => ({ text, confidence, box: { x: 0, y: 0, width: 10, height: 10 } });

describe("screenPlausible（枠に、それらしい文字があるか）", () => {
  const good = {
    score: [line("2345")],
    title: [line("SP ANOTHER 12"), line("1824")],
    judge: [line("1200"), line("300"), line("12"), line("3"), line("1")],
  };

  it("3 つの枠に、それらしい文字がそろっていれば OK", () => {
    expect(screenPlausible(good)).toEqual({ score: true, title: true, judge: true, all: true });
  });

  it("スコア枠は、数字が 3 桁以上ないと NG（文字だけ・数字 2 桁）", () => {
    expect(screenPlausible({ ...good, score: [line("EX")] }).score).toBe(false);
    expect(screenPlausible({ ...good, score: [line("12")] }).score).toBe(false);
    expect(screenPlausible({ ...good, score: [line("1"), line("234")] }).score).toBe(true);
  });

  it("曲名枠は、難易度の語（読み間違いの一部でも）か、2 行以上のある程度の文字で OK", () => {
    expect(screenPlausible({ ...good, title: [line("LEGGENDARIA")] }).title).toBe(true);
    expect(screenPlausible({ ...good, title: [line("ANOTH ER")] }).title).toBe(true);
    expect(screenPlausible({ ...good, title: [line("Heartache"), line("12345")] }).title).toBe(true);
    expect(screenPlausible({ ...good, title: [line("ab")] }).title).toBe(false);
    expect(screenPlausible({ ...good, title: [] }).title).toBe(false);
  });

  it("判定枠は、項目名（GREAT・GOOD・BAD・POOR）が 2 種類以上読めても OK（数字は読み間違えやすい）", () => {
    expect(screenPlausible({ ...good, judge: [line("GREAT"), line("G00D"), line("BAD")] }).judge).toBe(true);
    expect(screenPlausible({ ...good, judge: [line("CREAT"), line("日"), line("BAD")] }).judge).toBe(true);
    expect(screenPlausible({ ...good, judge: [line("GREAT")] }).judge).toBe(false);
    expect(screenPlausible({ ...good, judge: [line("GREAT"), line("GREAT")] }).judge).toBe(false);
  });

  it("判定枠は、数字の塊が 4 つ以上（または数字 5 桁分以上）で OK", () => {
    expect(screenPlausible({ ...good, judge: [line("12"), line("3"), line("4")] }).judge).toBe(false);
    expect(screenPlausible({ ...good, judge: [line("1200 300 12 3")] }).judge).toBe(true);
    expect(screenPlausible({ ...good, judge: [line("123456")] }).judge).toBe(true);
  });

  it("確度の低い行は、文字として数えない", () => {
    expect(screenPlausible({ ...good, score: [line("2345", 10)] }).score).toBe(false);
  });

  it("何も読めなければ全部 NG", () => {
    expect(screenPlausible({ score: [], title: [], judge: [] }).all).toBe(false);
  });
});

describe("AutoCaptureGate（いつ撮影するか）", () => {
  it(`静止して、画面が合った状態が ${REQUIRED_STREAK} 回続いたら撮影する`, () => {
    const g = new AutoCaptureGate();
    expect(g.update(true, true)).toEqual({ detected: true, trigger: false });
    expect(g.update(true, true)).toEqual({ detected: true, trigger: true });
  });

  it("動いている・画面が合っていないと、数え直し", () => {
    const g = new AutoCaptureGate();
    g.update(true, true);
    expect(g.update(false, null)).toEqual({ detected: false, trigger: false });
    expect(g.update(true, true).trigger).toBe(false);
    g.update(true, false);
    expect(g.update(true, true).trigger).toBe(false);
    expect(g.update(true, true).trigger).toBe(true);
  });

  it("下見をしなかった回（null）は、数えも、リセットもしない", () => {
    const g = new AutoCaptureGate();
    g.update(true, true);
    expect(g.update(true, null)).toEqual({ detected: true, trigger: false });
    expect(g.update(true, true).trigger).toBe(true);
  });

  it("撮影したあと、同じ画面を映し続けても、また撮影しない。画面が外れるか動いたら、また待ち受ける", () => {
    const g = new AutoCaptureGate();
    g.update(true, true);
    expect(g.update(true, true).trigger).toBe(true);
    for (let i = 0; i < 5; i++) expect(g.update(true, true)).toEqual({ detected: true, trigger: false });
    // 動かす → 次に合わせれば、また撮影する
    g.update(false, null);
    g.update(true, true);
    expect(g.update(true, true).trigger).toBe(true);
  });

  it("画面が外れても、待ち受けに戻る", () => {
    const g = new AutoCaptureGate();
    g.update(true, true);
    g.update(true, true);
    g.update(true, false);
    g.update(true, true);
    expect(g.update(true, true).trigger).toBe(true);
  });
});
