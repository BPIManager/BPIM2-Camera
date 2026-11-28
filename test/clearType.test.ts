import { describe, expect, it } from "vitest";
import { parseClearType } from "@/lib/recognition/clearType";

/** OCR の行（位置は x と幅だけ使う） */
const line = (text: string, x: number, width = 300) => ({ text, box: { x, y: 0, width, height: 30 } });

describe("CLEAR TYPE の読み取り", () => {
  it("左がベスト、右が今回。1 行にまとまっていても分ける", () => {
    expect(parseClearType([line("EXH-CLEAR A-CLEAR", 0, 600)], 700)).toEqual({ best: "EX HARD CLEAR", current: "ASSIST CLEAR" });
    expect(parseClearType([line("F-COMBO", 20, 200), line("H-CLEAR", 340, 200)], 700)).toEqual({ best: "FULLCOMBO CLEAR", current: "HARD CLEAR" });
  });

  it("読みのくせを許す（先頭の欠け・E→C・- が = や空白・CLEAR の崩れ）", () => {
    expect(parseClearType([line("XH-CLEAR A-CLCAR", 0, 600)], 700)).toEqual({ best: "EX HARD CLEAR", current: "ASSIST CLEAR" });
    expect(parseClearType([line("-COMBO F=COMBO", 0, 600)], 700).current).toBe("FULLCOMBO CLEAR");
    expect(parseClearType([line("EXH-CLEAR H CLCAR", 0, 600)], 700).current).toBe("HARD CLEAR");
    expect(parseClearType([line("CXH-CLEAR AGLEAR", 0, 600)], 700).current).toBe("ASSIST CLEAR");
    expect(parseClearType([line("H-CLEAR A-CUCAR", 0, 600)], 700).current).toBe("ASSIST CLEAR");
  });

  it("EXH-CLEAR を H-CLEAR や CLEAR と取らない。頭文字のない CLEAR は CLEAR", () => {
    expect(parseClearType([line("EXH-CLEAR", 0, 250), line("CLEAR", 330, 150)], 700)).toEqual({ best: "EX HARD CLEAR", current: "CLEAR" });
  });

  it("見出しの「CLEAR TYPE」の CLEAR は拾わない", () => {
    expect(parseClearType([line("CLEAR TYPE F-COMBO F=COMBO", 0, 650)], 700)).toEqual({ best: "FULLCOMBO CLEAR", current: "FULLCOMBO CLEAR" });
    // 今回のランプが読めず、見出しとベストだけのとき、ベストを今回と取り違えない
    expect(parseClearType([line("CLEAR TYPE EXH-CLEAR", 0, 300)], 700)).toEqual({ best: "EX HARD CLEAR", current: null });
  });

  it("1 つしか読めなければ、位置で決める。読めなければ null", () => {
    expect(parseClearType([line("A-CLEAR", 400, 150)], 700)).toEqual({ best: null, current: "ASSIST CLEAR" });
    expect(parseClearType([line("H-CLEAR", 20, 150)], 700)).toEqual({ best: "HARD CLEAR", current: null });
    expect(parseClearType([line("ベストスコア", 0, 200), line("今回のスコア", 350, 200)], 700)).toEqual({ best: null, current: null });
  });
});
