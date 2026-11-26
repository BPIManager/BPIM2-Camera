import type { ChartRef, RawResult } from "@/lib/domain/types";
import { isExScoreInRange, verifyExScore, verifyJudgeTotal } from "@/lib/domain/score";
import { matchChart, type MatchCandidate } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";

export type ResolveIssue =
  | "song-ambiguous"
  | "song-not-found"
  | "ex-missing"
  | "ex-out-of-range"
  | "ex-mismatch"
  | "judge-total-mismatch";

export interface Resolution {
  chart: ChartRef | null;
  candidates: MatchCandidate[];
  exScore: number | null;
  issues: ResolveIssue[];
  /** 確認操作なしで確定してよい（検算一致＋曲が一意） */
  autoConfirm: boolean;
}

export function toChartRef(e: SongMasterEntry): ChartRef {
  return {
    songId: e.songId,
    title: e.title,
    playStyle: e.playStyle,
    difficulty: e.difficulty,
    level: e.level,
    notes: e.notes,
  };
}

/** 読み取り結果を曲マスタと照合し、EX スコアを検算する。☆の高低は問わない */
export function resolveResult(
  raw: RawResult,
  master: readonly SongMasterEntry[],
  aliases: ReadonlyMap<string, number> = new Map(),
): Resolution {
  const issues: ResolveIssue[] = [];

  const aliased = raw.titleText ? aliases.get(raw.titleText) : undefined;
  const aliasEntry = aliased !== undefined ? master.find((s) => s.songId === aliased) : undefined;
  const outcome = aliasEntry
    ? { candidates: [{ entry: aliasEntry, score: 1 }], confident: true }
    : matchChart(master, raw);

  const top = outcome.candidates[0]?.entry ?? null;
  if (!top) issues.push("song-not-found");
  else if (!outcome.confident) issues.push("song-ambiguous");

  const ex = raw.exScore.value;
  if (ex === null) issues.push("ex-missing");
  else {
    if (top && !isExScoreInRange(ex, top.notes)) issues.push("ex-out-of-range");
    if (raw.judge && !verifyExScore(ex, raw.judge)) issues.push("ex-mismatch");
  }
  if (top && raw.judge && !verifyJudgeTotal(raw.judge, top.notes)) issues.push("judge-total-mismatch");

  return {
    chart: outcome.confident && top ? toChartRef(top) : null,
    candidates: outcome.candidates,
    exScore: ex,
    issues,
    autoConfirm: issues.length === 0,
  };
}
