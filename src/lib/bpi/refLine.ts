import type { ArenaAverage } from "./client";

/** チャートに重ねる参照線の選択肢。"none" 以外は、A1〜A5（アリーナ平均）か、ライバルの平均・トップ。自己歴代は、線ではなく、棒（ゴースト）で常に出す */
export type RefChoice = string;

export const ARENA_RANKS = ["A1", "A2", "A3", "A4", "A5"] as const;
const FIXED = ["none", "rival-avg", "rival-top"] as const;

export const REF_STORAGE_KEY = "bpim2-camera:chart-ref";

export interface RefLine {
  label: string;
  score: number;
}

export interface RefContext {
  arenaAverages?: Record<string, ArenaAverage>;
  /** ライバル（自分を除く）のスコア。取得前・失敗は null */
  rivalScores: readonly number[] | null;
}

export function isRefChoice(v: unknown): v is RefChoice {
  return typeof v === "string" && ((FIXED as readonly string[]).includes(v) || (ARENA_RANKS as readonly string[]).includes(v));
}

/**
 * 参照線の既定。保存された選択があればそれ、なければ自分のアリーナランクの平均（その平均が取れるとき）、なければ出さない。
 * （昔に保存した「自己歴代」の選択は、いまは棒で常に出すので、選択肢にない。無視して既定に戻る）
 */
export function defaultRefChoice(saved: string | null, arenaRank: string | null, arenaAverages?: Record<string, ArenaAverage>): RefChoice {
  if (isRefChoice(saved)) return saved;
  if (arenaRank && arenaAverages?.[arenaRank]) return arenaRank;
  return "none";
}

/** 選んだ参照線のスコア。選んだものが取れない（データなし）ときは null（線を描かない） */
export function refLineFor(choice: RefChoice, ctx: RefContext): RefLine | null {
  switch (choice) {
    case "none":
      return null;
    case "rival-avg":
      return ctx.rivalScores && ctx.rivalScores.length > 0
        ? { label: "ライバル平均", score: Math.round(ctx.rivalScores.reduce((a, b) => a + b, 0) / ctx.rivalScores.length) }
        : null;
    case "rival-top":
      return ctx.rivalScores && ctx.rivalScores.length > 0 ? { label: "ライバルトップ", score: Math.max(...ctx.rivalScores) } : null;
    default: {
      const avg = ctx.arenaAverages?.[choice]?.avgExScore;
      return avg === undefined ? null : { label: `${choice}平均`, score: Math.round(avg) };
    }
  }
}
