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
        judge: [[line("PGREAT 1544", 90, 0), line("GREAT 216", 90, 30)]],
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

describe("判定の枠が数字だけのとき", () => {
  const nums = (...v: [string, number][]) => v.map(([text, y]) => line(text, 90, y));
  it("1 行目を PG とし、スコア欄から逆算した GR が読めていれば確定する", () => {
    const r = rawFromPaddle(
      {
        title: [line("with you", 99), line("ANOTHER 9"), line("0891 NOTES")],
        score: [[line("1779")]],
        judge: [nums(["889", 0], ["1", 30], ["0", 60], ["0", 90], ["2", 120])],
      },
      [{ songId: 1, title: "with you…", playStyle: "SP", difficulty: "ANOTHER", level: 9, notes: 891 }],
    );
    expect(r?.exScore.value).toBe(1779);
  });
  it("逆算した GR が読めていなければ確定しない", () => {
    const r = rawFromPaddle(
      {
        title: [line("with you", 99), line("ANOTHER 9"), line("0891 NOTES")],
        score: [[line("1779")]],
        judge: [[line("889", 90, 0), line("7", 60, 30), line("0", 55, 60)]],
      },
      [{ songId: 1, title: "with you…", playStyle: "SP", difficulty: "ANOTHER", level: 9, notes: 891 }],
    );
    expect(r?.exScore.value).toBeNull();
  });
});

describe("スコア欄の読みが、前処理の違う 2 通りで一致したとき", () => {
  const master: SongMasterEntry[] = [{ songId: 9, title: "UNDO THE NIGHT", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1787 }];
  const title = [line("UNDO THENIGHT", 94), line("ANOTHER 12", 88), line("SP/1787 NOTE", 88)];
  it("実機のログ（色抜き 3365・緩い条件 3380・元画像 3365）は、3365 に確定する", () => {
    const r = rawFromPaddle(
      {
        title,
        score: [[line("3365", 89)], [line("3380", 77)], [line("3365", 96), line("AAA+0108", 79)]],
        scoreGroups: ["color", "color", "raw"],
        judge: [[line("1S91", 58), line("18", 58)]],
      },
      master,
    );
    expect(r?.exScore.value).toBe(3365);
  });
  it("同じ前処理でも、確度が高い読みどうしの一致なら確定する", () => {
    const r = rawFromPaddle({ title, score: [[line("3365", 89)], [line("3365", 90)]], scoreGroups: ["color", "color"], judge: [[]] }, master);
    expect(r?.exScore.value).toBe(3365);
  });
  it("確度の低い読みどうしの一致では確定しない", () => {
    const r = rawFromPaddle({ title, score: [[line("3365", 60)], [line("3365", 55)]], scoreGroups: ["color", "color"], judge: [[]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
  it("確度が低い読みは数えない", () => {
    const r = rawFromPaddle({ title, score: [[line("3365", 89)], [line("3365", 60)]], scoreGroups: ["color", "raw"], judge: [[]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
});

describe("実機のログ（モニター越しの撮影）", () => {
  const m = (songId: number, title: string, level: number, notes: number, difficulty: "ANOTHER" | "HYPER" = "ANOTHER") => ({ songId, title, playStyle: "SP" as const, difficulty, level, notes });
  const master: SongMasterEntry[] = [
    m(5235, "TIEFSEE", 12, 1752),
    m(5573, "ASIAN VIRTUAL REALITIES (MELTING TOGETHER IN DAZZLING DARKNESS)", 12, 1752),
    m(5721, "BLAZING_LAZER", 12, 1752),
    m(5605, "二人ノ廃城幽踊宴", 12, 1927),
    m(7809, "onslaught", 12, 1927),
  ];
  it("TIEFSEE: NOTES が切れていても SP1752 からノーツ数を取り、色抜き 3307 と元画像 3307（確度 59）で確定する", () => {
    const r = rawFromPaddle(
      {
        title: [line("TEFSEE", 97), line("SOUNDHOLICVG dJTAKAfOat YURI", 88), line("ANOTHER12", 93), line("SP1752 NOT", 93)],
        score: [[line("3307", 100), line("一", 72)], [line("330m", 82)], [line("3307", 59), line("M", 59)]],
        scoreGroups: ["color", "color", "raw"],
        judge: [[line("1S66", 78), line("4", 99), line("1566", 65), line("3", 65)]],
      },
      master,
    );
    expect(r?.exScore.value).toBe(3307);
  });
  it("二人ノ廃城幽踊宴: レベルが 2 と崩れても、難易度＋ノーツ数＋曲名で特定し、判定表（1552・333）と合意して確定する", () => {
    const r = rawFromPaddle(
      {
        title: [line("二人ノ民城幽踊宴", 72), line("ANOTHER 2 SP 1927", 89), line("上ノ新つかさ", 91)],
        score: [[], [], [line("3437", 63), line("FHHET", 63), line("+0020", 82)]],
        scoreGroups: ["color", "color", "raw"],
        judge: [[line("1552", 92), line("31", 66)], [line("1552", 95), line("333", 73)]],
      },
      master,
    );
    expect(r?.exScore.value).toBe(3437);
  });
  it("難易度の後ろが崩れた ANOTHERに でも、難易度として扱う", async () => {
    const { parseChartHints } = await import("@/lib/recognition/tokens");
    const h = parseChartHints([{ text: "ANOTHERに", confidence: 80 }, { text: "SP 1927 NG", confidence: 80 }]);
    expect(h.difficulty).toBe("ANOTHER");
    expect(h.notes).toBe(1927);
  });
});

describe("判定表の PG・GR から計算した EX が、スコア欄の読みと 1 桁違いのとき", () => {
  const master: SongMasterEntry[] = [{ songId: 5605, title: "二人ノ廃城幽踊宴", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1927 }];
  const title = [line("二人ノ廃城幽踊宴", 92), line("ANOTHER 2 SP/1927 NG", 93)];
  it("スコア欄が 3407 と読まれても、判定表（1552・333）から 3437 に確定する", () => {
    const r = rawFromPaddle({ title, score: [[line("3407", 54)]], scoreGroups: ["raw"], judge: [[line("1552", 86), line("333", 79), line("11", 67)]] }, master);
    expect(r?.exScore.value).toBe(3437);
  });
  it("PG＋GR がノーツ数に届かない組み合わせは使わない（偶然の一致を避ける）", () => {
    const r = rawFromPaddle({ title, score: [[line("3407", 54)]], scoreGroups: ["raw"], judge: [[line("1352", 86), line("11", 67)]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
  it("スコア欄の読みと 2 桁以上違うなら確定しない", () => {
    const r = rawFromPaddle({ title, score: [[line("3017", 54)]], scoreGroups: ["raw"], judge: [[line("1552", 86), line("333", 79)]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
});

describe("曲の決定（resolveResult まで通す）", () => {
  const master: SongMasterEntry[] = [
    { songId: 4351, title: "The Clown of 24stairs", playStyle: "SP", difficulty: "NORMAL", level: 6, notes: 579 },
    { songId: 4352, title: "The Clown of 24stairs", playStyle: "SP", difficulty: "HYPER", level: 10, notes: 1146 },
    { songId: 5703, title: "The Clown of 24stairs", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1788 },
    { songId: 9000, title: "RINNE", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1788 },
  ];
  it("実機のログ: レベルが 2 と読まれ、NOTES が切れていても、曲が決まる", async () => {
    const { resolveResult } = await import("@/lib/recognition/resolve");
    const raw = rawFromPaddle(
      {
        title: [line("The Clown of 24stairs", 96), line("ANOTHER 2 S 7 1788 NOT", 78), line("Yu_Asahina", 78)],
        score: [[line("3810", 66)], [], [line("32108", 79), line("+0055", 98)]],
        scoreGroups: ["color", "color", "raw"],
        judge: [[line("1476", 60), line("258", 81)]],
      },
      master,
    );
    expect(raw).not.toBeNull();
    const res = resolveResult(raw!, master);
    expect(res.chart?.songId).toBe(5703);
    expect(res.issues).not.toContain("song-not-found");
  });
});

describe("確度の高い読みが 2 回そろったとき", () => {
  const master: SongMasterEntry[] = [{ songId: 5703, title: "The Clown of 24stairs", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1788 }];
  const title = [line("The clownof24stars", 91), line("Yu Asahina", 72), line("S 7 8 NO", 72), line("ANOTHER12", 82)];
  it("実機のログ: 色抜き 3210(98)・緩い条件 3210(92)・元画像 3219(56) は、3210 に確定する", () => {
    const r = rawFromPaddle(
      {
        title,
        score: [[line("3210", 98)], [line("3210", 92), line("OE", 62)], [line("5", 56), line("3219", 56), line("0000", 56)]],
        scoreGroups: ["color", "color", "raw"],
        judge: [[line("e", 84), line("2", 84), line("1476", 81), line("25e", 56)]],
      },
      master,
    );
    expect(r?.exScore.value).toBe(3210);
  });
  it("確度の高い別の値が競合しているときは確定しない", () => {
    const r = rawFromPaddle({ title, score: [[line("3210", 98)], [line("3210", 92)], [line("3219", 85)]], scoreGroups: ["color", "color", "raw"], judge: [[]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
  it("読めた PG と矛盾する値（逆算した GR がノーツ数に合わない）は確定しない", () => {
    const r = rawFromPaddle({ title, score: [[line("3210", 98)], [line("3210", 92)]], scoreGroups: ["color", "color"], judge: [[line("1200", 90)]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
});

describe("確度の合算（実機のログ）", () => {
  const master: SongMasterEntry[] = [{ songId: 5703, title: "The Clown of 24stairs", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1788 }];
  it("末尾にゴミが付いた 32107(70)・3210(54)・3210C(81) は、3210 に確定する", () => {
    const r = rawFromPaddle(
      {
        title: [line("The Clown of 24stair", 90), line("Yu_Asahina", 100), line("ANOTHER 2 SP 1788", 78)],
        score: [[line("32107", 70), line("EC", 70)], [line("3210", 54), line("LIC.", 54)], [line("3210C", 81), line("AAA", 81), line("2+00", 81), line("+0855", 62)]],
        scoreGroups: ["color", "color", "raw"],
        judge: [[line("L", 53)]],
      },
      master,
    );
    expect(r?.exScore.value).toBe(3210);
  });
  it("5 桁の読みは、先頭・末尾どちらにゴミが付いた場合も候補にする", () => {
    expect(scoreCandidates("32107")).toEqual(expect.arrayContaining(["3210", "2107"]));
    expect(scoreCandidates("93695")).toEqual(expect.arrayContaining(["3695", "9369"]));
  });
});

describe("桁が抜けただけの読みは、競合として数えない", () => {
  const master: SongMasterEntry[] = [{ songId: 1867, title: "with you…", playStyle: "SP", difficulty: "ANOTHER", level: 9, notes: 891 }];
  const title = [line("with you", 94), line("ANOTHER 9", 97), line("0891 NOTES", 90)];
  it("1779(100)・1779(100)・1779(82)・179(85) は 1779 に確定する", () => {
    const r = rawFromPaddle({ title, score: [[line("1779", 100)], [line("1779", 100)], [line("1779", 82)], [line("179", 85)]], scoreGroups: ["color", "color", "color", "raw"], judge: [[]] }, master);
    expect(r?.exScore.value).toBe(1779);
  });
  it("同じ桁数で 1 桁違う読み（1778）が確度 85 なら、確定しない", () => {
    const r = rawFromPaddle({ title, score: [[line("1779", 100)], [line("1779", 100)], [line("1778", 85)]], scoreGroups: ["color", "color", "raw"], judge: [[]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
});

describe("5 桁以上の読み（左の 4 桁も候補にする）", () => {
  const master: SongMasterEntry[] = [{ songId: 5703, title: "The Clown of 24stairs", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1788 }];
  const title = [line("The Clown of 24stairs", 96), line("ANOTHER 12", 88), line("SP 1788 NOTES", 88)];
  it("scoreCandidates: 5 桁なら左と右の 4 桁、6 桁以上でも左と右の 4 桁", () => {
    expect(scoreCandidates("32107")).toEqual(expect.arrayContaining(["3210", "2107"]));
    expect(scoreCandidates("432107")).toEqual(expect.arrayContaining(["4321", "2107"]));
    expect(scoreCandidates("3210")).toEqual(["3210"]);
  });
  it("末尾にゴミ（バッジ）が付いた 32107(98) と、3210(95) は、3210 に確定する", () => {
    const r = rawFromPaddle({ title, score: [[line("32107", 98)], [line("3210", 95)]], scoreGroups: ["color", "color"], judge: [[]] }, master);
    expect(r?.exScore.value).toBe(3210);
  });
  it("末尾にゴミが付いた読みが 2 回そろっても、左の 4 桁は確度を割り引くので、確定しない（根拠が弱い）", () => {
    const r = rawFromPaddle({ title, score: [[line("32107", 70)], [line("32107", 60)]], scoreGroups: ["color", "color"], judge: [[]] }, master);
    expect(r?.exScore.value).toBeNull();
  });
  it("同じ確度の読みから出た 2 つの解釈（左 4 桁と右 4 桁）は、お互いを競合にしない", () => {
    const r = rawFromPaddle({ title, score: [[line("93210", 91)], [line("3210", 100)], [line("3210", 92)]], scoreGroups: ["color", "color", "raw"], judge: [[]] }, master);
    expect(r?.exScore.value).toBe(3210);
  });
});

describe("実機のログ（少年は空を辿る）", () => {
  const master: SongMasterEntry[] = [
    { songId: 5252, title: "少年は空を辿る", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1729 },
    { songId: 1, title: "少年A", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1500 },
    { songId: 2, title: "千年ノ理", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1400 },
  ];
  it("曲名の末尾が欠けても（類似度 0.71）、2 位を大きく引き離していれば曲が決まり、3 桁の断片に邪魔されず EX が確定する", () => {
    const r = rawFromPaddle(
      {
        title: [line("少年は空を越", 81), line("Power Of Naturo", 76), line("g NoTES", 76), line("ANOTHER 12", 76)],
        score: [[line("3379", 83)], [line("3379", 83)], [line("336", 82)], [line("+0047", 80)]],
        scoreGroups: ["color", "color", "color", "raw"],
        judge: [[line("1654", 88), line("5", 62)]],
      },
      master,
    );
    expect(r?.titleText).toBe("少年は空を辿る");
    expect(r?.exScore.value).toBe(3379);
  });
  it("似た曲名どうしで差が小さいときは、確定しない", async () => {
    const { matchChart } = await import("@/lib/songs/matcher");
    const similar: SongMasterEntry[] = [
      { songId: 10, title: "少年は空を辿る", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1729 },
      { songId: 11, title: "少年は空を渡る", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1600 },
    ];
    expect(matchChart(similar, { playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: null, titleText: "少年は空を越" }).confident).toBe(false);
  });
});
