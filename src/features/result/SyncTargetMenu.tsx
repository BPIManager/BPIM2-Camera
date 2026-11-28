import { useEffect } from "react";
import { Check, Undo2 } from "lucide-react";
import { SYNC_TARGETS, type SyncTarget } from "@/lib/bpi/syncTarget";
import { cn } from "@/lib/utils";
import { ServiceIcon, type ServiceId, type SyncService } from "./SyncServices";

interface Props {
  value: SyncTarget;
  onChange: (t: SyncTarget) => void;
  onClose: () => void;
  /** 連携しているサービス。送る・送らないを選べる */
  services: readonly SyncService[];
  onToggle: (id: ServiceId) => void;
  /** beat-seeker に登録した記録を取り消せるとき（登録して、まだ取り消していない）。取り消せなければ null */
  onRevert: (() => void) | null;
}

/**
 * 同期ボタンの上に開くメニュー。送り先のサービス（送る・送らない）と、BPIM2 の保存先（最新バージョン / INFINITAS）を選ぶ。
 * ここでの選択は、この結果だけに効く
 */
export default function SyncTargetMenu({ value, onChange, onClose, services, onToggle, onRevert }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* 外側のタップで閉じる */}
      <button type="button" aria-label="閉じる" tabIndex={-1} onClick={onClose} className="fixed inset-0 z-10 cursor-default" />
      <div role="menu" aria-label="同期の送り先" className="animate-in fade-in slide-in-from-bottom-2 absolute right-0 bottom-full z-20 mb-2 w-72 rounded-lg border border-border bg-card p-1 shadow-lg duration-150">
        <p className="px-3 py-2 text-xs text-muted-foreground">送り先</p>
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            role="menuitemcheckbox"
            aria-checked={s.on}
            disabled={s.blocked !== null}
            onClick={() => onToggle(s.id)}
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:hover:bg-transparent", s.on && "bg-accent/60")}
          >
            <ServiceIcon service={{ ...s, on: s.blocked === null }} className="size-5" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{s.label}</span>
              {s.blocked && <span className="block text-xs text-muted-foreground">{s.blocked}</span>}
            </span>
            {s.on && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
          </button>
        ))}
        <p className="px-3 pt-3 pb-2 text-xs text-muted-foreground">BPIM2 の保存先</p>
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
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent", value === t.id && "bg-accent/60")}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-muted-foreground">{t.hint}</span>
            </span>
            {value === t.id && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
          </button>
        ))}
        {onRevert && (
          <>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRevert();
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <Undo2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              beat-seeker の登録を取り消す
            </button>
          </>
        )}
      </div>
    </>
  );
}
