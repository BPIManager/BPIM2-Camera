import { useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import { clearDebugRecords, getDebugRecords, subscribeDebug } from "@/lib/debug/ocrLog";

/** デバッグモードがオンのとき、OCR の読み取り結果（JSON）を確認する。閉じた状態で置く。新しい順に、直近 10 件 */
export default function DebugSection() {
  const records = useSyncExternalStore(subscribeDebug, getDebugRecords, getDebugRecords);
  const json = useMemo(() => JSON.stringify(records, null, 2), [records]);

  return (
    <details className="group border-b border-border py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>
          OCR の読み取り結果（JSON）
          <span className="ml-1 font-normal text-muted-foreground">{records.length} 件</span>
        </span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          撮影して読み取るたびに、読み取った文字と確度（括弧内）、確定した結果を記録します。デバッグモードをオフにすると消えます。
        </p>
        {records.length === 0 ? (
          <p className="text-xs text-muted-foreground">まだありません。撮影すると、ここに出ます。</p>
        ) : (
          <pre className="max-h-96 overflow-auto rounded-md border border-border bg-secondary/60 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">{json}</pre>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={records.length === 0}
            onClick={() => {
              void navigator.clipboard.writeText(json).then(
                () => toast.success("コピーしました"),
                () => toast.error("コピーできませんでした"),
              );
            }}
          >
            コピー
          </Button>
          <Button variant="outline" size="sm" disabled={records.length === 0} onClick={clearDebugRecords}>
            クリア
          </Button>
        </div>
      </div>
    </details>
  );
}
