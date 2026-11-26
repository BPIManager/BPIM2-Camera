import type { JudgeCounts } from "@/lib/domain/types";

export interface JudgeSolution {
  judge: Omit<JudgeCounts, "fast" | "slow">;
  exScore: number;
  /** EX が OCR のトークンにも現れた（独立した 2 つの根拠が一致した） */
  crossChecked: boolean;
}

/**
 * OCR で拾った数字の集合から、ノーツ数と整合する判定内訳を探す。
 * 制約: PG+GR+GD+BD+POOR = notes。EX = PG×2+GR が数字集合にも現れれば確度が高い。
 * 読み落とされやすい 0 は集合になくても使える。
 */
export function solveJudge(numbers: readonly number[], notes: number): JudgeSolution[] {
  const pool = [...new Set([0, ...numbers.filter((n) => n <= notes)])];
  const poolSet = new Set(pool);
  const present = new Set(numbers);
  const found: JudgeSolution[] = [];

  for (const pg of pool) {
    for (const gr of pool) {
      const rest = notes - pg - gr;
      if (rest < 0) continue;
      const tail = splitRest(rest, pool, poolSet);
      if (!tail) continue;
      const exScore = pg * 2 + gr;
      found.push({
        judge: { pgreat: pg, great: gr, good: tail[0], bad: tail[1], poor: tail[2] },
        exScore,
        crossChecked: present.has(exScore),
      });
    }
  }
  return found.sort((a, b) => Number(b.crossChecked) - Number(a.crossChecked) || b.judge.pgreat - a.judge.pgreat);
}

/** rest を GD/BD/POOR の 3 つに分ける（各値は pool から）。見つからなければ null */
function splitRest(rest: number, pool: number[], poolSet: Set<number>): [number, number, number] | null {
  if (rest === 0) return [0, 0, 0];
  // 大きい値を GD→BD→POOR の順に割り当てる（EX には影響しない。内訳表示のための事前分布）
  const desc = [...pool].sort((a, b) => b - a);
  for (const gd of desc) {
    if (gd > rest) continue;
    for (const bd of desc) {
      const poor = rest - gd - bd;
      if (poor >= 0 && poor <= bd && poolSet.has(poor)) return [gd, bd, poor];
    }
  }
  return null;
}

/**
 * EX スコアの候補を確度順に返す。判定内訳で裏付けられたものを先頭にし、
 * 裏付けがなければ範囲内の数字を大きい順（EX は他の項目より大きいことが多い）に並べる。
 */
export function exCandidates(numbers: readonly number[], notes: number | null, solutions: readonly JudgeSolution[]): number[] {
  const ordered: number[] = [];
  const push = (n: number) => {
    if (!ordered.includes(n)) ordered.push(n);
  };
  for (const s of solutions) if (s.crossChecked) push(s.exScore);
  for (const s of solutions.slice(0, 3)) push(s.exScore);
  const max = notes ? notes * 2 : 9999;
  [...numbers]
    .filter((n) => n >= 100 && n <= max)
    .sort((a, b) => b - a)
    .forEach(push);
  return ordered.slice(0, 3);
}
