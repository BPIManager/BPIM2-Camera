import type { OcrEngine } from "./paddle/engine";

/**
 * 使用オプション（リザルト画面の USE OPTION の欄）。SP は 1 つ、DP は左右の組（「RAN / MIR」など）。
 * 長いものから順に照らし合わせる（R-RANDOM を RANDOM と読まないように）
 */
const SP_OPTIONS = ["SYNC-RANDOM", "SYMM-RANDOM", "R-RANDOM", "S-RANDOM", "H-RANDOM", "RANDOM", "MIRROR", "OFF"] as const;
/** DP の左右の略記。左右の組（「RAN / MIR」）で読めたときだけ使う（RANDOM の読み欠け「RAND」を RAN と取らないように） */
const DP_OPTIONS = ["R-RAN", "S-RAN", "H-RAN", "RAN", "MIR", "OFF", "FLIP"] as const;
/** 表示用の候補（結果画面で選び直すとき） */
export const USE_OPTION_CHOICES = ["OFF", "RANDOM", "R-RANDOM", "S-RANDOM", "H-RANDOM", "MIRROR"] as const;

/** OCR の読みのくせを直して、比べやすくする（英大文字・数字・ハイフン・スラッシュだけ残す） */
function normalize(text: string): string {
  return text
    .toUpperCase()
    .replace(/[‐－–—ー]/g, "-")
    .replace(/[／]/g, "/")
    .replace(/0/g, "O")
    .replace(/[^A-Z/-]/g, "");
}

/** 1 つの側（SP の全体、DP の左右の片方）から、オプションの名前を探す */
function findOption(part: string, options: readonly string[]): string | null {
  // 見出し（USE OPTION）の読み崩れ（TION・ON・OPION など）の後ろにあることが多いので、そのまま含みで探す
  // S-RANDOM などはハイフンまで一致したときだけ（見出しの読み崩れ「POH」の H を H-RANDOM と取らないように）
  for (const o of options) if (part.includes(o)) return o;
  return null;
}

/**
 * 使用オプションの欄の OCR の行から、オプションを決める。読めなければ null
 * 例: `USE OPTION RANDOM` → RANDOM、`TION S-RANDOM` → S-RANDOM、`USE OPTION RAN / MIR` → RAN / MIR
 */
export function parseUseOption(lines: readonly { text: string }[]): string | null {
  const text = normalize(lines.map((l) => l.text).join(" "));
  if (!text) return null;
  // 見出しの文字（USEOPTION の断片）を取り除く。オプション名と重なる部分（OPTION の ON・OFF の O など）を壊さないよう、確かな部分だけ
  const body = text.replace(/^.*?(USE)?O?P?T?I?ON(?=[A-Z])/, "");
  const sides = body.split("/").filter(Boolean);
  if (sides.length >= 2) {
    const left = findOption(sides[0]!, [...SP_OPTIONS, ...DP_OPTIONS]);
    const right = findOption(sides[1]!, [...SP_OPTIONS, ...DP_OPTIONS]);
    if (left && right) return `${left} / ${right}`;
  }
  return findOption(body, SP_OPTIONS) ?? findOption(text, SP_OPTIONS);
}

/** 画像の一部を、OCR に渡せる画素にする（横幅 width に拡大・縮小） */
export function cropPixels(image: ImageBitmap, r: { x: number; y: number; width: number; height: number }, width: number): ImageData {
  const h = Math.max(1, Math.round((r.height * width) / r.width));
  const c = new OffscreenCanvas(width, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, width, h);
  return ctx.getImageData(0, 0, width, h);
}

/** 使用オプションの欄を読む */
export async function readUseOption(pixels: ImageData, engine: OcrEngine): Promise<string | null> {
  return parseUseOption(await engine.readLines(pixels));
}
