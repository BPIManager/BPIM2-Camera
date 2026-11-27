import Input from "@/components/ui/input";
import { USE_OPTION_CHOICES } from "@/lib/recognition/useOption";
import type { CountKey } from "./useResultEditor";

const COUNTS: { key: CountKey; label: string }[] = [
  { key: "missCount", label: "ミスカウント" },
  { key: "fast", label: "FAST" },
  { key: "slow", label: "SLOW" },
];

/**
 * 結果の詳細。使用オプションは読み取れた値を出し、違えば選び直せる。
 * ミスカウント・FAST・SLOW は、いまは読み取れないので、手で入力する（分析タブに使い、学習サンプルの正解にもなる。空でもよい）
 */
export default function ResultDetails({
  useOption,
  onUseOption,
  counts,
  onCount,
}: {
  useOption: string | null;
  onUseOption: (v: string | null) => void;
  counts: Record<CountKey, string>;
  onCount: (key: CountKey, text: string) => void;
}) {
  // 読み取った値が一覧に無い（DP の組など）ときは、その値も選べるようにする
  const choices: readonly string[] = useOption && !USE_OPTION_CHOICES.includes(useOption as never) ? [...USE_OPTION_CHOICES, useOption] : USE_OPTION_CHOICES;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="use-option" className="text-sm text-muted-foreground">
          使用オプション
        </label>
        <select
          id="use-option"
          value={useOption ?? ""}
          onChange={(e) => onUseOption(e.target.value === "" ? null : e.target.value)}
          className="h-9 min-w-36 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">（読み取れず）</option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {COUNTS.map(({ key, label }) => (
          <div key={key} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`count-${key}`} className="text-xs text-muted-foreground">
              {label}
            </label>
            <Input
              id={`count-${key}`}
              inputMode="numeric"
              placeholder="—"
              value={counts[key]}
              onChange={(e) => onCount(key, e.target.value)}
              className="h-9 text-center tabular-nums"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
