import { Check, Loader2 } from "lucide-react";
import type { SyncStatus } from "@/hooks/useBpimSync";

/** BPIM2 へのスコア保存の状況。曲名の横に出す（同期中はスピナー、終わったら完了の表示） */
export default function SyncChip({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  switch (status.kind) {
    case "idle":
      return null;
    case "syncing":
      return (
        <span role="status" className="mt-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          BPIM に保存中
        </span>
      );
    case "saved":
      return (
        <span role="status" className="mt-1 flex shrink-0 items-center gap-1 text-xs text-success">
          <Check className="size-3.5" aria-hidden />
          BPIM に保存しました
        </span>
      );
    // 自己ベスト未更新は、トーストで知らせる（ResultDrawer）。ここには出さない
    case "not-improved":
      return null;
    case "error":
      return (
        <span role="alert" className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-destructive" title={status.message}>
          保存できませんでした
          <button type="button" onClick={onRetry} className="underline">
            再試行
          </button>
        </span>
      );
  }
}
