import { useEffect, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { toast, Toaster } from "sonner";
import { getDownloads, subscribeDownloads } from "@/lib/recognition/downloads";

const TOASTER = "downloads";
const TOAST_ID = "ocr-download";
export const formatBytes = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * OCR のモデル・ランタイムを取得している間、画面下部に進み具合を出す。取得し終えたら閉じる。
 * 通常の通知（画面上部）とは別の Toaster に出す
 */
export default function DownloadProgress() {
  const downloads = useSyncExternalStore(subscribeDownloads, getDownloads);
  const active = downloads.some((d) => !d.done);
  const loaded = downloads.reduce((a, d) => a + d.loaded, 0);
  // 大きさが分からないもの（圧縮して送られたもの）があれば、全体の大きさは出さない
  const known = downloads.every((d) => d.done || d.total > 0);
  const total = known ? downloads.reduce((a, d) => a + Math.max(d.total, d.loaded), 0) : 0;

  useEffect(() => {
    if (!active) {
      toast.dismiss(TOAST_ID);
      return;
    }
    const ratio = total > 0 ? Math.min(1, loaded / total) : 0;
    toast.custom(
      () => (
        <div className="flex w-[min(92vw,360px)] flex-col gap-2 rounded-lg border border-border bg-card p-3 text-foreground shadow-lg" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Download className="size-4 text-primary" aria-hidden />
            読み取りのモデルを取得しています
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            {total > 0 ? (
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {total > 0 ? `${formatBytes(loaded)} / ${formatBytes(total)}` : `${formatBytes(loaded)} 取得済み`}（{downloads.filter((d) => d.done).length}/{downloads.length} ファイル）。初回だけ取得し、端末に保存します
          </p>
        </div>
      ),
      { id: TOAST_ID, toasterId: TOASTER, duration: Number.POSITIVE_INFINITY },
    );
  }, [active, loaded, total, downloads]);

  // 画面下のタブに重ならないよう、少し上に出す
  return <Toaster id={TOASTER} position="bottom-center" offset={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }} theme="dark" />;
}
