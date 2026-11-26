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

/** 「SP ANOTHER ☆12」のような譜面の表示。難易度で色を変える */
export default function DifficultyBadge({ playStyle, difficulty, level, className }: { playStyle: string; difficulty: Difficulty; level: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-bold", TONES[difficulty], className)}>
      {playStyle} {difficulty} ☆{level}
    </span>
  );
}
