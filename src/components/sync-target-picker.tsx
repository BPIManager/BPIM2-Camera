import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { SYNC_TARGETS, isSyncTarget, type SyncTarget } from "@/lib/bpi/syncTarget";

/** BPIM2 の同期先（最新バージョン / INFINITAS）の選択。設定とセットアップで使う */
export default function SyncTargetPicker({ value, onChange }: { value: SyncTarget; onChange: (t: SyncTarget) => void }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => isSyncTarget(v) && onChange(v)} aria-label="BPIM2 の同期先">
      {SYNC_TARGETS.map((t) => (
        <RadioItem key={t.id} value={t.id} className="h-11 px-2 text-sm">
          {t.label}
        </RadioItem>
      ))}
    </RadioGroup>
  );
}
