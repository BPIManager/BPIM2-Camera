import { useEffect } from "react";
import { Check } from "lucide-react";
import { SYNC_TARGETS, type SyncTarget } from "@/lib/bpi/syncTarget";
import { cn } from "@/lib/utils";

interface Props {
  value: SyncTarget;
  onChange: (t: SyncTarget) => void;
  onClose: () => void;
}

/** 同期ボタンの上に開く、保存先の選択（いまの保存先を示す）。ここでの選択は、この結果だけに効く */
export default function SyncTargetMenu({ value, onChange, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* 外側のタップで閉じる */}
      <button
        type="button"
        aria-label="閉じる"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-10 cursor-default"
      />
      <div
        role="menu"
        aria-label="BPIM2 の同期先"
        className="animate-in fade-in slide-in-from-bottom-2 absolute right-0 bottom-full z-20 mb-2 w-72 rounded-lg border border-border bg-card p-1 shadow-lg duration-150"
      >
        <p className="px-3 py-2 text-xs text-muted-foreground">
          スコア保存先(BPIM2)
        </p>
        {SYNC_TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="menuitemradio"
            aria-checked={value === t.id}
            onClick={() => {
              onChange(t.id);
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent",
              value === t.id && "bg-accent/60",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted-foreground">
                {t.hint}
              </span>
            </span>
            {value === t.id && (
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </>
  );
}
