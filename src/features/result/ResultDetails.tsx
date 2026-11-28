import Input from "@/components/ui/input";
import { USE_OPTION_CHOICES } from "@/lib/recognition/useOption";
import type { CountKey } from "./useResultEditor";

/**
 * 結果の詳細（使用オプション・BP）。閉じた状態では小さく 1 行で出すだけで、開くと直せる。
 * 使用オプションは読み取れた値（読めなければ OFF）。BP（ミスカウント）は、いまは読み取れないので手で入力する（分析タブに使い、学習サンプルの正解にもなる。空でもよい）。
 * FAST・SLOW は、読み取りを作るまで、学習用に写真を集めるだけにする（欄は出さない）
 */
export default function ResultDetails({
  useOption,
  onUseOption,
  counts,
  onCount,
}: {
  useOption: string;
  onUseOption: (v: string) => void;
  counts: Record<CountKey, string>;
  onCount: (key: CountKey, text: string) => void;
}) {
  // 読み取った値が一覧に無い（DP の組など）ときは、その値も選べるようにする
  const choices: readonly string[] = !USE_OPTION_CHOICES.includes(useOption as never) ? [...USE_OPTION_CHOICES, useOption] : USE_OPTION_CHOICES;
  return (
    <details className="group rounded-md border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          オプション <span className="font-medium text-foreground">{useOption}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          BP <span className="font-medium tabular-nums text-foreground">{counts.missCount === "" ? "—" : counts.missCount}</span>
        </span>
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="use-option" className="text-sm text-muted-foreground">
            使用オプション
          </label>
          <select
            id="use-option"
            value={useOption}
            onChange={(e) => onUseOption(e.target.value)}
            className="h-9 w-36 rounded-md border border-border bg-background px-2 text-sm"
          >
            {choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="count-missCount" className="text-sm text-muted-foreground">
            BP
          </label>
          <Input
            id="count-missCount"
            inputMode="numeric"
            placeholder="—"
            value={counts.missCount}
            onChange={(e) => onCount("missCount", e.target.value)}
            className="h-9 w-36 text-center tabular-nums"
          />
        </div>
      </div>
    </details>
  );
}
