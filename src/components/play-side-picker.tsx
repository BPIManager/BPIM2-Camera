import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import type { PlaySide } from "@/lib/storage/settings";

/**
 * プレーサイド（自動・1P・2P）の選択。設定とセットアップで使う。
 * 2P のリザルト画面では、スコア・判定の欄が右へ、曲名が左下へ動くので、枠の初期位置や画像の取り込みで使う
 */
export default function PlaySidePicker({ value, inferred, onChange }: { value: PlaySide | "auto"; inferred: PlaySide; onChange: (v: PlaySide | "auto") => void }) {
  const items: { id: PlaySide | "auto"; label: string }[] = [
    { id: "auto", label: `自動（${inferred}）` },
    { id: "1P", label: "1P" },
    { id: "2P", label: "2P" },
  ];
  return (
    <RadioGroup value={value} onValueChange={(v) => (v === "auto" || v === "1P" || v === "2P") && onChange(v)} aria-label="プレーサイド" className="grid-cols-3">
      {items.map((it) => (
        <RadioItem key={it.id} value={it.id} className="h-11 px-2 text-sm">
          {it.label}
        </RadioItem>
      ))}
    </RadioGroup>
  );
}
