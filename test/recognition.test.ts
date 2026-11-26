import { describe, expect, it } from "vitest";
import type { RawResult } from "@/lib/domain/types";
import { resolveResult } from "@/lib/recognition/resolve";
import { sharpness, toGray } from "@/lib/vision/frame";
import { ConsensusVoter, StabilityTracker } from "@/lib/vision/stability";
import { master } from "./fixtures";

function raw(over: Partial<RawResult> = {}): RawResult {
  return {
    playStyle: "SP",
    difficulty: "ANOTHER",
    level: 10,
    notes: 930,
    titleText: "HEARTACHE",
    exScore: { value: 1796, confidence: 0.99 },
    bestExScore: 0,
    judge: { pgreat: 867, great: 62, good: 1, bad: 0, poor: 0, fast: 37, slow: 26 },
    missCount: 0,
    bestMissCount: null,
    clearType: "FULLCOMBO CLEAR",
    bestClearType: "FULLCOMBO CLEAR",
    djLevel: "AAA",
    useOption: "RANDOM",
    isNewRecord: true,
    ...over,
  };
}

describe("resolveResult", () => {
  it("サンプル1枚目（☆10）は確認なしで確定する", () => {
    const r = resolveResult(raw(), master);
    expect(r.autoConfirm).toBe(true);
    expect(r.chart?.level).toBe(10);
  });

  it("検算が合わないときは確定しない（Tesseract の誤読 26 を想定）", () => {
    const r = resolveResult(raw({ exScore: { value: 26, confidence: 0.4 } }), master);
    expect(r.autoConfirm).toBe(false);
    expect(r.issues).toContain("ex-mismatch");
  });

  it("曲が見つからなければ手入力へ回す", () => {
    const r = resolveResult(raw({ level: 9, notes: 1 }), master);
    expect(r.issues).toContain("song-not-found");
    expect(r.chart).toBeNull();
  });

  it("ユーザーが過去に修正した別名を優先する", () => {
    const r = resolveResult(
      raw({ level: null, notes: null, difficulty: null, titleText: "HEARTACHF" }),
      master,
      new Map([["HEARTACHF", 1]]),
    );
    expect(r.chart?.title).toBe("HEARTACHE");
  });
});

describe("vision", () => {
  const flat = (v: number) => toGray(new Uint8ClampedArray(16 * 16 * 4).fill(v), 16, 16);
  const noisy = () => {
    const a = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < a.length; i += 4) a[i] = a[i + 1] = a[i + 2] = (i / 4) % 2 ? 255 : 0;
    return toGray(a, 16, 16);
  };

  it("鮮明で静止した画面が連続したら撮影可、動いたらリセット", () => {
    const t = new StabilityTracker({ requiredFrames: 2, maxDiff: 3, minSharpness: 40 });
    const f = noisy();
    expect(t.push(f, true)).toBe(false);
    expect(t.push(f, true)).toBe(false);
    expect(t.push(f, true)).toBe(true);
    expect(t.push(flat(0), true)).toBe(false);
  });

  it("のっぺりした画像はピンボケ扱い", () => {
    expect(sharpness(flat(128))).toBe(0);
    expect(sharpness(noisy())).toBeGreaterThan(40);
  });

  it("同じ値が連続で読めたら確定する", () => {
    const v = new ConsensusVoter<number>(2);
    expect(v.push(1796)).toBeNull();
    expect(v.push(1796)).toBe(1796);
    expect(v.push(26)).toBeNull();
  });
});

describe("matchChart: 表記ゆれで二重登録された譜面", () => {
  it("同じ譜面の重複は 1 つにまとめ、曲名が合えば確定する", async () => {
    const { matchChart } = await import("@/lib/songs/matcher");
    const entry = (songId: number, title: string) => ({ songId, title, playStyle: "SP" as const, difficulty: "ANOTHER" as const, level: 9, notes: 891 });
    const master = [entry(1867, "with you…"), entry(5707, "with you..."), { ...entry(1959, "With your Smile"), level: 8, notes: 788 }];
    const r = matchChart(master, { playStyle: "SP", difficulty: "ANOTHER", level: 9, notes: null, titleText: "with you" });
    expect(r.confident).toBe(true);
    expect(r.candidates[0].entry.notes).toBe(891);
  });
});
