import { USE_OPTION_CHOICES } from "@/lib/recognition/useOption";

/** 結果の詳細（使用オプションなど）。読み取れた値を出し、違えば選び直せる */
export default function ResultDetails({ useOption, onUseOption }: { useOption: string | null; onUseOption: (v: string | null) => void }) {
  // 読み取った値が一覧に無い（DP の組など）ときは、その値も選べるようにする
  const choices: readonly string[] = useOption && !USE_OPTION_CHOICES.includes(useOption as never) ? [...USE_OPTION_CHOICES, useOption] : USE_OPTION_CHOICES;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
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
  );
}
