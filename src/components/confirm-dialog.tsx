import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  /** 閉じる（キャンセル・Esc・外側のタップ）。実行中は閉じない */
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 取り消せない操作。警告アイコンを付け、実行ボタンを赤にする */
  destructive?: boolean;
  /** 実行中。ボタンを押せなくし、閉じられないようにする */
  loading?: boolean;
}

/**
 * 確認用の共通モーダル（window.confirm の置き換え）。中身は title / description で渡し、
 * 実行したときの処理は onConfirm で渡す。スマホでは下から出るシート、広い画面では中央に出す
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "実行",
  cancelLabel = "キャンセル",
  destructive = false,
  loading = false,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 親の再描画で参照が変わっても、フォーカスや Esc の登録をやり直さない
  const guard = useRef({ onClose, loading });
  guard.current = { onClose, loading };

  useEffect(() => {
    if (!open) return;
    // 取り消せない操作は、誤って押さないようキャンセルに先にフォーカスする
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !guard.current.loading && guard.current.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="閉じる"
        tabIndex={-1}
        disabled={loading}
        onClick={onClose}
        className="animate-in fade-in absolute inset-0 bg-scrim duration-200"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? "confirm-desc" : undefined}
        className={cn(
          "animate-in fade-in slide-in-from-bottom-6 zoom-in-95 relative flex w-full max-w-sm flex-col gap-4 rounded-t-2xl border border-border bg-card p-5 text-card-foreground shadow-xl duration-300 sm:rounded-2xl",
          "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex flex-col gap-2">
          <h2 id="confirm-title" className="flex items-center gap-2 text-lg font-semibold">
            {destructive && <AlertTriangle className="size-5 shrink-0 text-destructive" />}
            {title}
          </h2>
          {description && (
            <div id="confirm-desc" className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button ref={cancelRef} variant="outline" disabled={loading} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
