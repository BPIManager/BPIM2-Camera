import { describe, expect, it } from "vitest";
import { pickTitleLine, rawFromPaddle } from "@/lib/recognition/paddle/fromPaddle";
import type { OcrLine } from "@/lib/recognition/paddle/engine";
import { parseJudgeRows, parseJudgeLines, scoreCandidates } from "@/lib/recognition/paddle/parse";
import type { SongMasterEntry } from "@/lib/songs/types";

const line = (text: string, confidence = 90, y = 0, x = 0): OcrLine => ({ text, confidence, box: { x, y, width: 10, height: 10 } });
const master: SongMasterEntry[] = [
  { songId: 1, title: "Angel's Ladder", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1800 },
  { songId: 2, title: "UNDO THE NIGHT", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1787 },
];

describe("parseJudgeLines", () => {
  it("ラベル付きの行から PG・GR を取る", () => {
    expect(parseJudgeLines(["PGREAT 1151", "GREAT 0842", "GOOD 12", "BAD 3", "POOR 1"])).toEqual({ pg: 1151, gr: 842, gd: 12, bd: 3, poor: 1 });
  });
  it("PGREAT のラベルが欠けても並び順で補う", () => {
    expect(parseJudgeLines(["GREAT 1151", "GREAT 0842"])).toMatchObject({ pg: 1151, gr: 842 });
  });
  it("O や I を数字に寄せる", () => {
    expect(parseJudgeLines(["GREAT 1O5I"])).toMatchObject({ gr: 1051 });
  });
});

describe("pickTitleLine", () => {
  it("ノーツ数・難易度の行を除いて曲名を選ぶ", () => {
    expect(pickTitleLine([line("Angel's Ladder", 99), line("71800 NOTES"), line("ANOTHER 12")])).toBe("Angel's Ladder");
  });
});

describe("rawFromPaddle", () => {
  it("曲を特定し、スコア欄と判定表で EX を確定する", () => {
    const r = rawFromPaddle(
      {
        title: [line("Angel's Lader", 95), line("71800 NOTES"), line("ANOTHER 12")],
        score: [[line("3304")], [line("3304")]],
        judge: [line("PGREAT 1544", 90, 0), line("GREAT 216", 90, 30)],
      },
      master,
    );
    expect(r?.exScore.value).toBe(3304);
  });
  it("あり得ない桁数のスコアは採らない", () => {
    const r = rawFromPaddle({ title: [line("Angel's Ladder"), line("1800 NOTES"), line("ANOTHER 12")], score: [[line("3472322")], [line("3472322")]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
});

describe("parseJudgeRows", () => {
  it("ラベルと数字が別の行に分かれても、位置でそろえる", () => {
    const j = parseJudgeRows([line("GREAT", 90, 0, 0), line("1235", 90, 1, 50), line("GREAT", 90, 30, 0), line("57", 90, 31, 50), line("GOOD", 90, 60, 0), line("12", 90, 61, 50)]);
    expect(j).toMatchObject({ pg: 1235, gr: 57, gd: 12 });
  });
  it("PGREAT のラベルが読めなくても、すぐ上の行を PG とする", () => {
    const j = parseJudgeRows([line("ONGAT", 90, 0, 0), line("1471", 90, 1, 50), line("GREAT", 90, 30, 0), line("10", 90, 31, 50)]);
    expect(j).toMatchObject({ pg: 1471, gr: 10 });
  });
});

describe("scoreCandidates", () => {
  it("先頭に余計な桁が付いた読みから、候補を作る", () => {
    expect(scoreCandidates("02382")).toContain("2382");
    expect(scoreCandidates("52316")).toContain("2316");
    expect(scoreCandidates("3304")).toEqual(["3304"]);
  });
});
