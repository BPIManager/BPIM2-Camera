import type { RawResult } from "@/lib/domain/types";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { decideExScore, type Observations } from "./consensus/engine";
import { isReliableGr, type JudgeRead } from "./judgeRead";
import { editDistance } from "@/lib/songs/normalize";
import { guessTitle } from "./fromTokens";
import { voteScore } from "./scoreVote";
import { parseChartHints, type OcrToken } from "./tokens";

/**
 * 曲名帯のトークンとスコア枠の読み取り結果から結果を組み立てる。
 * EX は複数回の読み取りが一致し、かつ譜面のノーツ数から見て範囲内のときだけ確定する。
 */
export function rawFromRegions(
  titleTokens: readonly OcrToken[],
  scoreReadings: readonly (readonly string[])[],
  master: readonly SongMasterEntry[],
  /** 日本語 OCR で読んだ曲名の 1 行（文字ごとに分かれたトークンを連結したもの） */
  japaneseTitle?: string,
  /** スコア欄以外の独立した読み（ジャッジ表・DJ LEVEL 行の差分・ベストとの差分）。あれば合意で EX を決める */
  extras?: Omit<Observations, "notes" | "score">,
  /** true なら、独立した読みの合意でしか EX を確定しない（スコア欄の読みだけの多数決では確定しない） */
  requireConsensus = false,
  /** 前処理の違う複数の読みで、確度の高い読みが一致した値。合意がないときの代わりに、1 つに決まれば採る */
  crossValues: readonly number[] = [],
  /** 判定表の枠で読めた数字すべて。PG・GR の組み合わせから EX を作り、スコア欄の読みと 1 桁違い以内なら裏付けにする */
  judgePool: readonly JudgeRead[] = [],
  /** 複数の読みが指している値（確度の合算が高いもの。前処理の種類は問わない）。PG と矛盾しないときだけ採る */
  strongValues: readonly number[] = [],
  /** 曲名の枠に写っていた文字の行（アーティスト名の候補）。曲データのアーティスト名との照合に使う */
  artistTexts: readonly string[] = [],
  /** スコア欄の読みの値 → 最も高い確度（0〜100）。判定表から作った値で上書きしてよいかの判断に使う */
  scoreConfidence: ReadonlyMap<number, number> = new Map(),
): RawResult | null {
  const hints = parseChartHints(titleTokens);
  const titleText = japaneseTitle?.trim() || guessTitle(titleTokens);
  // レベルの読み違い（II を 1 と読むなど）に備え、確定しなければレベルを外して照合し直す
  let match = matchChart(master, { ...hints, titleText, artistTexts });
  if (!match.confident) {
    // 1) ノーツ数が読めていれば、レベルを外して（難易度＋ノーツ数＋曲名）で絞る。2) それも外れたら、レベルとノーツ数を外して曲名で絞る
    const attempts = [
      ...(hints.notes !== null ? [{ ...hints, level: null }] : []),
      ...(titleText || artistTexts.length > 0 ? [{ ...hints, level: null, notes: null }] : []),
    ];
    for (const a of attempts) {
      const relaxed = matchChart(master, { ...a, titleText, artistTexts });
      if (relaxed.confident) {
        match = relaxed;
        break;
      }
    }
  }
  // 曲名の弱い一致で範囲を狭めると正しい EX まで除外するので、確定した譜面のノーツ数だけを使う
  const notes = hints.notes ?? (match.confident ? match.candidates[0].entry.notes : null);
  const vote = voteScore(scoreReadings, notes);
  // 独立した読みが 2 つ以上そろえば合意で決める。足りなければ従来どおり、スコア欄の多数決だけで判断する
  const consensus =
    notes !== null && extras
      ? decideExScore({ notes, score: [...new Set(scoreReadings.flatMap((r) => r.map(Number).filter((n) => Number.isInteger(n))))], ...extras })
      : null;
  const scoreNumbers = [...new Set(scoreReadings.flatMap((rd) => rd.map(Number).filter((n) => Number.isInteger(n))))];
  const fallback =
    notes === null
      ? []
      : [
          ...new Set([
            ...crossValues.filter((v) => v >= 100 && v <= notes * 2),
            ...strongValues.filter((v) => v >= 100 && v <= notes * 2 && consistentWithPg(v, notes, judgePool)),
            ...approximatePairs(judgePool, notes, scoreNumbers, scoreConfidence),
          ]),
        ];
  const exValue = consensus?.status === "confirmed" ? consensus.value : requireConsensus ? (fallback.length === 1 ? fallback[0] : null) : vote.value;
  const exCandidates = exValue !== null ? [] : [...new Set([...(consensus?.ranked.map((c) => c.value) ?? []), ...vote.candidates])].slice(0, 3);
  if (hints.difficulty === null && hints.notes === null && titleText === null && vote.candidates.length === 0) return null;

  // 譜面が確定していれば、読み取った生の値（レベルの読み違いなど）ではなく、特定した譜面の値を返す
  const chart = match.confident ? match.candidates[0].entry : null;
  return {
    playStyle: chart?.playStyle ?? hints.playStyle,
    difficulty: chart?.difficulty ?? hints.difficulty,
    level: chart?.level ?? hints.level,
    notes: chart?.notes ?? hints.notes,
    titleText: chart?.title ?? titleText,
    exScore: exValue !== null ? { value: exValue, confidence: consensus?.status === "confirmed" ? 0.97 : 0.9 } : { value: null, confidence: exCandidates.length ? 0.3 : 0 },
    bestExScore: null,
    judge: extras?.judge?.pg !== undefined && extras.judge.gr !== undefined ? { pgreat: extras.judge.pg, great: extras.judge.gr, good: extras.judge.gd ?? 0, bad: extras.judge.bd ?? 0, poor: extras.judge.poor ?? 0, fast: null, slow: null } : null,
    missCount: null,
    bestMissCount: null,
    clearType: null,
    bestClearType: null,
    djLevel: null,
    useOption: null,
    isNewRecord: false,
    exCandidates,
  };
}

/** 難易度・レベル・ノーツ数の読み取りだけで譜面が 1 件に絞れるか。絞れれば日本語 OCR は不要 */
export function chartResolvedByHints(titleTokens: readonly OcrToken[], master: readonly SongMasterEntry[]): boolean {
  const hints = parseChartHints(titleTokens);
  if (hints.notes === null || hints.difficulty === null || hints.level === null) return false;
  return matchChart(master, { ...hints, titleText: null }).confident;
}

/** スコア欄の読みがこの確度以上なら、判定表から作った 1 桁違いの値で上書きしない（判定表の誤読のほうを疑う） */
export const TRUSTED_SCORE_CONFIDENCE = 95;

/**
 * 判定表の枠で読めた数字から、PG・GR の組み合わせの EX（PG×2＋GR）を作り、スコア欄の読みと 1 桁違い以内のものを返す。
 * 偶然の一致を避けるため、PG＋GR はノーツ数の 90〜100%、PG > GR を条件にする（実際のリザルトでは、
 * GOOD 以下はノーツ数の 1 割に満たないことがほとんど）。
 * 1 桁違いの相手のスコア欄の読みが十分に確か（TRUSTED_SCORE_CONFIDENCE 以上）なら、その値は採らない。
 * 判定表の数字は小さく、スコア欄より読み違えやすい（実機で 2829（確度 98）を 2827、2338 を 2238 と誤確定した。#3）
 */
export function approximatePairs(pool: readonly JudgeRead[], notes: number, scores: readonly number[], scoreConfidence: ReadonlyMap<number, number> = new Map()): number[] {
  const out = new Set<number>();
  for (const pgRead of pool) {
    for (const grRead of pool) {
      const pg = pgRead.n;
      const gr = grRead.n;
      const sum = pg + gr;
      if (pg < 100 || pg <= gr || !isReliableGr(grRead) || sum > notes || sum < notes * 0.9) continue;
      const ex = pg * 2 + gr;
      const near = scores.filter((s) => editDistance(String(s), String(ex)) <= 1);
      if (near.length === 0) continue;
      // スコア欄が別の値を確かに読んでいれば、判定表の誤読とみなす
      if (near.some((s) => s !== ex && (scoreConfidence.get(s) ?? 0) >= TRUSTED_SCORE_CONFIDENCE)) continue;
      out.add(ex);
    }
  }
  return [...out];
}

/**
 * EX が、読めた PG と矛盾しないか。PG（確度 80 以上で最大の数字）から GR を逆算し、PG＋GR がノーツ数の 90〜100% に収まるか見る。
 * PG が読めていなければ、確かめようがないので矛盾なしとする。
 */
export function consistentWithPg(ex: number, notes: number, pool: readonly JudgeRead[]): boolean {
  const pg = pool.filter((r) => r.conf >= 80 && r.n >= 100).sort((a, b) => b.n - a.n)[0];
  if (!pg) return true;
  const gr = ex - pg.n * 2;
  const sum = pg.n + gr;
  return gr >= 0 && sum <= notes && sum >= notes * 0.9;
}
