import type { RawResult } from "@/lib/domain/types";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { exCandidates, solveJudge } from "./solve";
import { numberTokens, parseChartHints, type OcrToken } from "./tokens";

const TITLE_MIN_LEN = 3;

/** タイトルらしい行: 数字・記号だけでない最長のトークン */
export function guessTitle(tokens: readonly OcrToken[]): string | null {
  const words = tokens.map((t) => t.text.trim()).filter((s) => s.length >= TITLE_MIN_LEN && /[A-Za-z぀-ヿ一-鿿]{3}/.test(s));
  return words.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * OCR トークンから読み取り結果を組み立てる。
 * 譜面は難易度＋レベル＋ノーツ数で絞り、ノーツ数が分かれば判定内訳と EX を検算で解く。
 * EX を裏付けられないときは確信度を下げ、候補だけを返す。
 */
export function rawFromTokens(tokens: readonly OcrToken[], master: readonly SongMasterEntry[]): RawResult | null {
  const hints = parseChartHints(tokens);
  const nums = withoutOne(numberTokens(tokens), hints.notes);
  if (hints.difficulty === null && hints.notes === null && nums.length === 0) return null;

  const match = matchChart(master, { ...hints, titleText: guessTitle(tokens) });
  const notes = hints.notes ?? match.candidates[0]?.entry.notes ?? null;
  const solutions = notes ? solveJudge(nums, notes) : [];
  const best = solutions[0];
  const confirmed = best?.crossChecked ? best : null;
  const candidates = exCandidates(nums, notes, solutions);

  return {
    playStyle: hints.playStyle,
    difficulty: hints.difficulty,
    level: hints.level,
    notes: hints.notes,
    titleText: guessTitle(tokens),
    exScore: confirmed
      ? { value: confirmed.exScore, confidence: 0.95 }
      : { value: null, confidence: candidates.length > 0 ? 0.3 : 0 },
    bestExScore: null,
    judge: confirmed ? { ...confirmed.judge, fast: null, slow: null } : null,
    missCount: null,
    bestMissCount: null,
    clearType: null,
    bestClearType: null,
    djLevel: null,
    useOption: null,
    isNewRecord: false,
    exCandidates: confirmed ? [] : candidates,
  };
}

/** 「1857 NOTES」の数字が EX や判定として二重に数えられないよう、ノーツ数の 1 件を除く */
function withoutOne(nums: number[], value: number | null): number[] {
  if (value === null) return nums;
  const i = nums.indexOf(value);
  return i < 0 ? nums : [...nums.slice(0, i), ...nums.slice(i + 1)];
}
