import type { ClearType } from "@/lib/domain/types";
import { USE_OPTION_CHOICES } from "@/lib/recognition/useOption";
import { LAMPS, lampShort, optionShort } from "@/lib/result/shortCodes";
import type { CountKey } from "./useResultEditor";

const CHIP = "relative inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-xs";

/**
 * 値を短く出し、押すと選べる欄。閉じているときは短い名前（HC・SR など）を出し、
 * 押すと、端末の選択肢（全部の名前）が開く（見えない select を、欄の上に重ねている）
 */
function SelectChip({ label, short, value, onChange, children }: { label: string; short: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <span className={CHIP}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{short}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0">
        {children}
      </select>
    </span>
  );
}

/**
 * クリアランプ・使用オプション（OP）・BP（ミスカウント）。曲の難易度の横に、小さな欄として並べる。
 * 閉じているときは短い名前を出し、押して直す。BP は、いまは読み取れないので手で入れる（空でもよい）
 */
export default function ResultChips({
  clearType,
  onClearType,
  useOption,
  onUseOption,
  counts,
  onCount,
}: {
  clearType: ClearType | null;
  onClearType: (v: ClearType | null) => void;
  useOption: string;
  onUseOption: (v: string) => void;
  counts: Record<CountKey, string>;
  onCount: (key: CountKey, text: string) => void;
}) {
  // 読み取った値が一覧に無い（DP の組など）ときは、その値も選べるようにする
  const options: readonly string[] = USE_OPTION_CHOICES.includes(useOption as never) ? USE_OPTION_CHOICES : [...USE_OPTION_CHOICES, useOption];
  return (
    <>
      <SelectChip label="ランプ" short={lampShort(clearType)} value={clearType ?? ""} onChange={(v) => onClearType(v === "" ? null : (v as ClearType))}>
        <option value="">未選択</option>
        {LAMPS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.value}
          </option>
        ))}
      </SelectChip>
      <SelectChip label="OP" short={optionShort(useOption)} value={useOption} onChange={onUseOption}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </SelectChip>
      <label className={CHIP}>
        <span className="text-muted-foreground">BP</span>
        <input
          inputMode="numeric"
          aria-label="BP（ミスカウント）"
          placeholder="—"
          value={counts.missCount}
          onChange={(e) => onCount("missCount", e.target.value)}
          className="w-9 bg-transparent text-center font-semibold tabular-nums outline-none placeholder:font-normal"
        />
      </label>
    </>
  );
}
