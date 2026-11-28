import type { ClearType } from "@/lib/domain/types";
import type { OcrEngine, OcrLine } from "./paddle/engine";

/** 頭文字の付いた CLEAR の読み崩れ（CLCAR・CUCAR・GLEAR・CLECAR・CEAR など） */
const CLEARISH = "[CG][LUI]?[EC]{1,2}A?R";
/**
 * リザルト画面の CLEAR TYPE の表記（略記）と、ランプ。読みのくせ（E→C、- が = や抜け、先頭の欠け）を許す。
 * 長いものから照らし合わせる（EXH-CLEAR を H-CLEAR や CLEAR と取らないように）
 */
const PATTERNS: readonly [RegExp, ClearType][] = [
  [new RegExp(`[EC]?XH-?${CLEARISH}`, "y"), "EX HARD CLEAR"],
  [/F?-?COM[BE][OU]/y, "FULLCOMBO CLEAR"],
  // H・A は、- を空白と読むことがある（「H CLCAR」）。E は「TYPE CLEAR」と紛れるので、空白は許さない
  [new RegExp(`H[- ]?${CLEARISH}`, "y"), "HARD CLEAR"],
  [new RegExp(`A[- ]?${CLEARISH}`, "y"), "ASSIST CLEAR"],
  [new RegExp(`E-?${CLEARISH}`, "y"), "EASY CLEAR"],
  [/FAIL[EC]D/y, "FAILED"],
  // 頭文字のない CLEAR は、読み崩れを広く許すと、ほかの文字の断片を拾うので、狭く
  [/CL[EC]AR/y, "CLEAR"],
];

/** 行の中のランプの表記を、左から順に拾う。位置は、行の幅を文字数で割って見積もる */
function findTokens(line: Pick<OcrLine, "text" | "box">): { type: ClearType; x: number }[] {
  const text = line.text.toUpperCase().replace(/[=‐－–—ー]/g, "-");
  const out: { type: ClearType; x: number }[] = [];
  let i = 0;
  while (i < text.length) {
    let hit: { type: ClearType; len: number } | null = null;
    for (const [re, type] of PATTERNS) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m[0].length > 0) {
        hit = { type, len: m[0].length };
        break;
      }
    }
    if (hit) {
      // 見出しの「CLEAR TYPE」の CLEAR は、ランプではない
      const isHeading = /^\s*T?YPE/.test(text.slice(i + hit.len));
      if (!isHeading) out.push({ type: hit.type, x: line.box.x + (line.box.width * (i + hit.len / 2)) / Math.max(1, text.length) });
      i += hit.len;
    } else i++;
  }
  return out;
}

/**
 * CLEAR TYPE の行の OCR から、ベストと今回のランプを決める。左がベスト、右が今回。
 * 1 つしか読めなければ、位置（画像の幅の半分より右か）でどちらかを決める。読めなければ null
 */
export function parseClearType(lines: readonly Pick<OcrLine, "text" | "box">[], width: number): { best: ClearType | null; current: ClearType | null } {
  const tokens = lines.flatMap(findTokens).sort((a, b) => a.x - b.x);
  if (tokens.length === 0) return { best: null, current: null };
  if (tokens.length === 1) return tokens[0]!.x > width * 0.45 ? { best: null, current: tokens[0]!.type } : { best: tokens[0]!.type, current: null };
  return { best: tokens[0]!.type, current: tokens.at(-1)!.type };
}

/**
 * CLEAR TYPE の行を読み、今回のランプを返す。範囲（画素）を順に読み、今回のランプが読めた時点で止める。読めなければ null。
 * 画素は、横幅 width に揃えて切り出したもの
 */
export async function readClearType(regions: readonly ImageData[], engine: OcrEngine): Promise<ClearType | null> {
  for (const pixels of regions) {
    const { current } = parseClearType(await engine.readLines(pixels), pixels.width);
    if (current) return current;
  }
  return null;
}
