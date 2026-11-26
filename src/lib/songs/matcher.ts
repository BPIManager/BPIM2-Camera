import type { Difficulty, PlayStyle } from "@/lib/domain/types";
import { normalizeTitle, titleSimilarity } from "./normalize";
import type { SongMasterEntry } from "./types";

export interface MatchQuery {
  playStyle: PlayStyle;
  difficulty: Difficulty | null;
  level: number | null;
  notes: number | null;
  titleText: string | null;
  /** 曲名の枠に写っていた文字（アーティスト名の候補）。曲データにアーティスト名があれば、曲名と合わせて使う */
  artistTexts?: readonly string[];
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
 * アーティスト名の重み。同じアーティストの曲は複数あるので、曲名がしっかり読めているときは、
 * 小さな上乗せにとどめる（他の曲まで点数が持ち上がって、正しい曲との差が縮まらないように）。
 * 曲名がほとんど読めていないときだけ、強く使う。
 */
const ARTIST_WEIGHT_WITH_TITLE = 0.6;
const ARTIST_WEIGHT_WITHOUT_TITLE = 0.9;
const TITLE_READABLE = 0.5;
const ARTIST_MIN_SIMILARITY = 0.6;
const ARTIST_MIN_LENGTH = 3;

/** 写っていた文字のうち、アーティスト名に最も近いものとの類似度。近くなければ 0 */
function artistSimilarity(texts: readonly string[] | undefined, artist: string | undefined): number {
  if (!texts?.length || !artist || normalizeTitle(artist).length < ARTIST_MIN_LENGTH) return 0;
  const best = Math.max(...texts.map((t) => titleSimilarity(t, artist)));
  return best >= ARTIST_MIN_SIMILARITY ? best : 0;
}
/** 曲名が少し崩れていても、2 位を大きく引き離していれば確定してよい（OCR で末尾が欠けるなど） */
const LEAD_SCORE = 0.65;
const LEAD_GAP = 0.25;

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

  // 表記ゆれ（… と ... など）で二重に登録された同じ譜面は 1 つにまとめる。BPI は曲名と難易度で計算するので影響しない
  const seen = new Set<string>();
  const distinct = narrowed.filter((e) => {
    const key = [normalizeTitle(e.title), e.playStyle, e.difficulty, e.level, e.notes].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const titleScores = distinct.map((entry) => (q.titleText ? titleSimilarity(q.titleText, entry.title) : 0));
  const artistWeight = Math.max(0, ...titleScores) >= TITLE_READABLE ? ARTIST_WEIGHT_WITH_TITLE : ARTIST_WEIGHT_WITHOUT_TITLE;
  const scored = distinct
    .map((entry, i) => {
      const t = titleScores[i];
      const a = artistSimilarity(q.artistTexts, entry.artist) * artistWeight;
      // 曲名が合っていれば、そこにアーティスト名の分を少し上乗せする。曲名が読めていなければ、アーティスト名が主になる
      return { entry, score: t + (1 - t) * a };
    })
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  const second = scored[1]?.score ?? 0;
  const confident =
    (!!q.titleText || !!q.artistTexts?.length) &&
    ((top[0].score >= CONFIDENT_SCORE && top[0].score - second >= 0.1) ||
      (top[0].score >= LEAD_SCORE && top[0].score - second >= LEAD_GAP) ||
      // 難易度とレベルで 1 件に絞れていれば、曲名が少し崩れていても確定してよい
      (distinct.length === 1 && q.difficulty !== null && q.level !== null && top[0].score >= 0.6));
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
