import type { Difficulty, PlayStyle } from "@/lib/domain/types";
import { editDistance } from "@/lib/songs/normalize";

export interface OcrToken {
  text: string;
  /** 0〜100（Tesseract の confidence） */
  confidence: number;
}

export interface ChartHints {
  playStyle: PlayStyle;
  difficulty: Difficulty | null;
  level: number | null;
  notes: number | null;
}

const DIFFICULTIES: Difficulty[] = ["BEGINNER", "NORMAL", "HYPER", "ANOTHER", "LEGGENDARIA"];

/** OCR が取り違えやすい文字を数字に寄せる（O→0, I/l→1, S→5, B→8） */
export function toDigits(s: string): string {
  return s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
}

/** トークン列から譜面の手掛かり（SP/DP・難易度・レベル・ノーツ数）を取り出す */
export function parseChartHints(tokens: readonly OcrToken[]): ChartHints {
  const text = tokens.map((t) => t.text).join(" ").toUpperCase();
  const dp = /\bDP\b/.test(text) && !/\bSP\b/.test(text);

  let difficulty: Difficulty | null = null;
  let level: number | null = null;
  for (const d of DIFFICULTIES) {
    const m = new RegExp(`${d}\\s*([0-9OIl]{1,2})`).exec(text);
    if (m) {
      difficulty = d;
      const lv = Number(toDigits(m[1]));
      level = lv >= 1 && lv <= 12 ? lv : null;
      break;
    }
  }

  // 文字の取り違え（ANOTHER → AWOTHER など）に備え、編集距離が近い単語も難易度とみなす
  if (difficulty === null) {
    for (const m of text.matchAll(/([A-Z]{5,11})\s*([0-9OIl]{1,2})(?![0-9])/g)) {
      const best = DIFFICULTIES.map((d) => ({ d, dist: editDistance(m[1], d) })).sort((a, b) => a.dist - b.dist)[0];
      if (best.dist <= Math.max(1, Math.floor(best.d.length * 0.2))) {
        difficulty = best.d;
        const lv = Number(toDigits(m[2]));
        level = lv >= 1 && lv <= 12 ? lv : null;
        break;
      }
    }
  }

  // レベルが崩れて読めなくても、難易度の語だけは取る（ANOTHERに など）
  if (difficulty === null) {
    for (const m of text.matchAll(/[A-Z]{5,11}/g)) {
      const best = DIFFICULTIES.map((d) => ({ d, dist: editDistance(m[0], d) })).sort((a, b) => a.dist - b.dist)[0];
      if (best.dist <= Math.max(1, Math.floor(best.d.length * 0.2))) {
        difficulty = best.d;
        break;
      }
    }
  }

  // 「1787 NOTES」。画面の端で切れて NOTES が読めないときは、「SP 1787」の形も使う
  const n = /([0-9OIl]{3,4})\s*NOTES?/.exec(text) ?? /\b(?:SP|DP)\s*\/?\s*([0-9OIl]{3,4})\b/.exec(text) ?? /\b(?:SP|DP)([0-9OIl]{3,4})\b/.exec(text);
  const notes = n ? Number(toDigits(n[1])) : null;
  return { playStyle: dp ? "DP" : "SP", difficulty, level, notes: notes && notes > 0 ? notes : null };
}

/** 数字だけのトークン（1〜4 桁）。スコア・判定・BP の候補 */
export function numberTokens(tokens: readonly OcrToken[]): number[] {
  const out: number[] = [];
  for (const t of tokens) {
    const s = t.text.trim();
    if (/^[0-9]{1,4}$/.test(s)) out.push(Number(s));
  }
  return out;
}
