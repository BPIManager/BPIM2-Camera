import type { Difficulty } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** 難易度ごとの背景・文字・縁の色（クラス名は静的に書く） */
const TONES: Record<Difficulty, string> = {
  BEGINNER: "bg-diff-beginner/20 text-diff-beginner border-diff-beginner/30",
  NORMAL: "bg-diff-normal/20 text-diff-normal border-diff-normal/30",
  HYPER: "bg-diff-hyper/20 text-diff-hyper border-diff-hyper/30",
  ANOTHER: "bg-diff-another/20 text-diff-another border-diff-another/30",
  LEGGENDARIA: "bg-diff-leggendaria/20 text-diff-leggendaria border-diff-leggendaria/30",
};

/** 難易度の頭文字。SPB（BEGINNER）・SPN（NORMAL）・SPH（HYPER）・SPA（ANOTHER）・SPL（LEGGENDARIA） */
const INITIALS: Record<Difficulty, string> = { BEGINNER: "B", NORMAL: "N", HYPER: "H", ANOTHER: "A", LEGGENDARIA: "L" };

/** 譜面の短い表記（SPL・DPA など） */
export const chartCode = (playStyle: string, difficulty: Difficulty): string => `${playStyle}${INITIALS[difficulty]}`;

/** 「SPL ☆12」のような譜面の表示。難易度で色を変える。正式名（SP LEGGENDARIA）は、読み上げと長押しで出す */
export default function DifficultyBadge({ playStyle, difficulty, level, className }: { playStyle: string; difficulty: Difficulty; level: number; className?: string }) {
  return (
    <span
      title={`${playStyle} ${difficulty} ☆${level}`}
      aria-label={`${playStyle} ${difficulty} ☆${level}`}
      className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-bold", TONES[difficulty], className)}
    >
      {chartCode(playStyle, difficulty)} ☆{level}
    </span>
  );
}
