import type { Difficulty, PlayStyle } from "@/lib/domain/types";
import { titleSimilarity } from "./normalize";
import type { SongMasterEntry } from "./types";

export interface MatchQuery {
  playStyle: PlayStyle;
  difficulty: Difficulty | null;
  level: number | null;
  notes: number | null;
  titleText: string | null;
}

export interface MatchCandidate {
  entry: SongMasterEntry;
  /** 0〜1 */
  score: number;
}

export interface MatchOutcome {
  candidates: MatchCandidate[];
  /** 確認操作なしで確定してよいか */
  confident: boolean;
}

const CONFIDENT_SCORE = 0.85;

/**
 * 難易度＋レベル＋SP/DP＋ノーツ数で絞り込み、曲名 OCR を決め手にする。
 * 絞り込みで 1 件に定まれば曲名なしで確定、複数残れば曲名の類似度で順位付けし上位 3 件を返す。
 */
export function matchChart(master: readonly SongMasterEntry[], q: MatchQuery): MatchOutcome {
  const narrowed = master.filter(
    (s) =>
      s.playStyle === q.playStyle &&
      (q.difficulty === null || s.difficulty === q.difficulty) &&
      (q.level === null || s.level === q.level) &&
      (q.notes === null || s.notes === q.notes),
  );

  if (narrowed.length === 0) return { candidates: [], confident: false };
  if (narrowed.length === 1 && q.notes !== null) {
    return { candidates: [{ entry: narrowed[0], score: 1 }], confident: true };
  }

  const scored = narrowed
    .map((entry) => ({ entry, score: q.titleText ? titleSimilarity(q.titleText, entry.title) : 0 }))
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  const second = scored[1]?.score ?? 0;
  const confident = !!q.titleText && top[0].score >= CONFIDENT_SCORE && top[0].score - second >= 0.1;
  return { candidates: top, confident };
}

/** 手入力検索用。曲名の部分一致を優先し、なければ類似度で並べる */
export function searchSongs(master: readonly SongMasterEntry[], text: string, limit = 20): SongMasterEntry[] {
  const t = text.trim();
  if (!t) return [];
  const lower = t.normalize("NFKC").toLowerCase();
  const included = master.filter((s) => s.title.normalize("NFKC").toLowerCase().includes(lower));
  if (included.length > 0) return included.slice(0, limit);
  return [...master]
    .map((s) => ({ s, score: titleSimilarity(t, s.title) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}
