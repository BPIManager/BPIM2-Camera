/**
 * beat-seeker のティア（BEAT-TIER・Rate-Tier）のしきい値。ポイントから、いまのティア・段と、次の段までの距離を求める。
 * 表示（結果画面のゲージ）用で、登録や判定には使わない（ティアの確定は beat-seeker が行う）。
 */

/** ティア 1 つ。steps は段（I〜V）の下限ポイント。段のないティア（Beginner・Legend）は空 */
export interface TierDef {
  name: string;
  /** このティアの下限 */
  floor: number;
  steps: readonly number[];
}

export interface TierTable {
  /** BEAT-TIER は beat、Rate-Tier は rate */
  id: "beat" | "rate";
  label: string;
  /** 下限の低い順 */
  tiers: readonly TierDef[];
}

const ROMAN = ["I", "II", "III", "IV", "V"] as const;

/** 段の数字（1〜5）を I〜V にする */
export const roman = (step: number): string => ROMAN[step - 1] ?? String(step);

/** 下限から一定の幅で 5 段 */
const linear = (floor: number, width: number): number[] => Array.from({ length: 5 }, (_, i) => floor + i * width);

/** 下限から 2 倍になるまで、等比で 5 段（Rate-Tier。段ごとに 2 の 5 乗根倍） */
const geometric = (floor: number): number[] => Array.from({ length: 5 }, (_, i) => floor * 2 ** (i / 5));

const beatTier = (name: string, floor: number, width: number): TierDef => ({ name, floor, steps: linear(floor, width) });
const rateTier = (name: string, floor: number): TierDef => ({ name, floor, steps: geometric(floor) });

/** BEAT-TIER：Novice は 400 刻み、Intermediate・Advanced・Expert は 200 刻み、Veteran 以上は 100 刻み */
export const BEAT_TIERS: TierTable = {
  id: "beat",
  label: "BEAT-TIER",
  tiers: [
    { name: "Beginner", floor: 0, steps: [] },
    beatTier("Novice", 10000, 400),
    beatTier("Intermediate", 12000, 200),
    beatTier("Advanced", 13000, 200),
    beatTier("Expert", 14000, 200),
    beatTier("Veteran", 15000, 100),
    beatTier("Commander", 15500, 100),
    beatTier("Elite", 16000, 100),
    beatTier("Master", 16500, 100),
    beatTier("Ancient", 17000, 100),
    beatTier("Mythic", 17500, 100),
    { name: "Legend", floor: 18000, steps: [] },
  ],
};

/** Rate-Tier：ティアの下限は 2 倍ずつ（25 → 50 → … → 25,600）。ティアの中の 5 段は等比 */
export const RATE_TIERS: TierTable = {
  id: "rate",
  label: "Rate-Tier",
  tiers: [
    { name: "Beginner", floor: 0, steps: [] },
    rateTier("Novice", 25),
    rateTier("Intermediate", 50),
    rateTier("Advanced", 100),
    rateTier("Expert", 200),
    rateTier("Veteran", 400),
    rateTier("Commander", 800),
    rateTier("Elite", 1600),
    rateTier("Master", 3200),
    rateTier("Ancient", 6400),
    rateTier("Mythic", 12800),
    { name: "Legend", floor: 25600, steps: [] },
  ],
};

/** ポイントの位置 */
export interface TierPosition {
  tierIndex: number;
  tier: TierDef;
  /** 段（1〜5）。段のないティアは null */
  step: number | null;
  /** 「Master II」のような表記 */
  label: string;
  /** このティアの範囲（上限は、次のティアの下限。最上位は null） */
  bandFloor: number;
  bandCeil: number | null;
  /** 次の段（最後の段なら、次のティア）と、そこまでの残り。最上位は null */
  next: { label: string; at: number } | null;
  remaining: number | null;
}

const labelOf = (tier: TierDef, step: number | null) => (step === null ? tier.name : `${tier.name} ${roman(step)}`);

/** ポイントから、いまのティア・段と、次の段までの距離を求める */
export function locate(table: TierTable, pt: number): TierPosition {
  const { tiers } = table;
  let tierIndex = 0;
  for (let i = 0; i < tiers.length; i++) if (pt >= tiers[i]!.floor) tierIndex = i;
  const tier = tiers[tierIndex]!;
  const nextTier = tiers[tierIndex + 1] ?? null;

  let stepIndex = -1;
  tier.steps.forEach((at, i) => {
    if (pt >= at) stepIndex = i;
  });
  const step = tier.steps.length > 0 ? Math.max(stepIndex, 0) + 1 : null;

  let next: TierPosition["next"] = null;
  if (step !== null && step < tier.steps.length) next = { label: labelOf(tier, step + 1), at: tier.steps[step]! };
  else if (nextTier) next = { label: labelOf(nextTier, nextTier.steps.length > 0 ? 1 : null), at: nextTier.floor };

  return {
    tierIndex,
    tier,
    step,
    label: labelOf(tier, step),
    bandFloor: tier.floor,
    bandCeil: nextTier?.floor ?? null,
    next,
    remaining: next ? Math.max(0, next.at - pt) : null,
  };
}
