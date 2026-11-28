import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { RESULT_TABS, isResultTab, type ResultTab } from "@/lib/result/resultTab";

/** 結果画面を開いたときのタブ（BPI / beat-seeker）の選択。設定とセットアップで使う */
export default function ResultTabPicker({ value, onChange }: { value: ResultTab; onChange: (t: ResultTab) => void }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => isResultTab(v) && onChange(v)} aria-label="結果画面の最初のタブ">
      {RESULT_TABS.map((t) => (
        <RadioItem key={t.id} value={t.id} className="h-11 px-2 text-sm">
          {t.label}
        </RadioItem>
      ))}
    </RadioGroup>
  );
}
