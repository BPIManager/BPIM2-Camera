import { useEffect, useRef, useState } from "react";
import { Download, Gauge } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { formatBytes } from "@/features/ocr/DownloadProgress";
import { BenchmarkStatus, OcrBackendPicker } from "@/features/ocr/OcrBackendPicker";
import { useOcrBenchmark } from "@/features/ocr/useOcrBenchmark";
import { hasWebGpu } from "@/lib/recognition/paddle/webgpu";
import { planBenchmarkDownloads, prefetch, type PrefetchItem } from "@/lib/recognition/prefetch";
import type { Settings } from "@/lib/storage/settings";

/** 取得の段階。checking: 何を取得するか調べている / consent: 同意を待っている / downloading: 取得中 / ready: 取得済み（ベンチマークへ） */
type Phase = { kind: "checking" } | { kind: "consent"; items: PrefetchItem[] } | { kind: "downloading"; loaded: number; total: number } | { kind: "ready" } | { kind: "error"; message: string; items: PrefetchItem[] };

/**
 * 読み取りの最適化。この端末で、サンプル画像を CPU と GPU で読んで速さを測り、速いほうを選ぶ。
 * 測る前に、使うモデルとランタイム（数十 MB）を取得する。取得してよいかを、大きさを示して確かめ、同意したらプログレスバーを出して取得する。
 * すでに取得済みなら、確かめずに測る。測り終えたら、選び直すこともできる
 */
export function OcrStep({ settings, update, onNext }: { settings: Settings; update: (p: Partial<Settings>) => void; onNext: () => void }) {
  const bench = useOcrBenchmark((result) => update({ ocrBackend: result.best, ocrBenchmark: result }));
  const { state, run } = bench;
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const abortRef = useRef<AbortController | null>(null);

  // 開いたら、取得が要るものを調べる。すべて取得済みなら、そのまま測る（測り終えていれば、測り直さない）
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const items = await planBenchmarkDownloads(await hasWebGpu());
        if (!alive) return;
        if (items.every((it) => it.cached)) {
          setPhase({ kind: "ready" });
          if (!settings.ocrBenchmark) void run();
        } else setPhase({ kind: "consent", items });
      } catch (e) {
        if (alive) setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e), items: [] });
      }
    })();
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

  const download = async (items: PrefetchItem[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "downloading", loaded: 0, total: items.reduce((a, it) => a + it.bytes, 0) });
    try {
      await prefetch(items, (loaded, total) => setPhase({ kind: "downloading", loaded, total }), controller.signal);
      setPhase({ kind: "ready" });
      void run();
    } catch (e) {
      if (controller.signal.aborted) return;
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e), items });
    }
  };

  const running = state.status === "running";
  const total = phase.kind === "consent" ? phase.items.reduce((a, it) => a + it.bytes, 0) : 0;
  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-xl font-semibold">読み取りの最適化</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">この端末で、読み取りを CPU と GPU のどちらで行うと速いかを測り、速いほうを選びます。</p>

        {phase.kind === "checking" && <p className="text-sm text-muted-foreground">準備しています</p>}

        {phase.kind === "consent" && (
          <Alert variant="info">
            <Download />
            <AlertTitle>読み取りに使うモデルを取得します（約 {formatBytes(total)}）</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-0.5 text-sm">
                {phase.items
                  .filter((it) => !it.cached)
                  .map((it) => (
                    <li key={it.label} className="flex justify-between gap-4">
                      <span>{it.label}</span>
                      <span className="text-muted-foreground tabular-nums">{formatBytes(it.bytes)}</span>
                    </li>
                  ))}
              </ul>
              <p className="text-xs text-muted-foreground">取得したものは端末に保存し、次からは取得しません。モバイル回線では通信量にご注意ください（Wi-Fi をおすすめします）。</p>
            </AlertDescription>
          </Alert>
        )}

        {phase.kind === "downloading" && (
          <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <p className="text-sm">モデルを取得しています</p>
            <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.total > 0 ? Math.round((phase.loaded / phase.total) * 100) : 0}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${phase.total > 0 ? Math.round((phase.loaded / phase.total) * 100) : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatBytes(phase.loaded)} / {formatBytes(phase.total)}（{phase.total > 0 ? Math.round((phase.loaded / phase.total) * 100) : 0}%）
            </p>
          </div>
        )}

        {phase.kind === "error" && <p className="text-sm text-destructive">取得できませんでした: {phase.message}</p>}

        {phase.kind === "ready" && (
          <>
            <Alert variant="info">
              <Gauge />
              <AlertTitle>{running ? "測っています" : "結果"}</AlertTitle>
              <AlertDescription>
                {state.status === "idle" ? <p className="text-sm text-muted-foreground">{settings.ocrBenchmark ? "測り終えています" : "まだ測っていません"}</p> : <BenchmarkStatus state={state} />}
              </AlertDescription>
            </Alert>
            {!running && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">あとから設定で変更・測り直しができます</p>
                <OcrBackendPicker value={settings.ocrBackend} onChange={(ocrBackend) => update({ ocrBackend })} benchmark={settings.ocrBenchmark} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 bg-background px-6 pt-3 pb-6">
        {phase.kind === "consent" && (
          <>
            <Button size="lg" onClick={() => void download(phase.items)}>
              取得して測る
            </Button>
            <Button variant="ghost" onClick={onNext}>
              あとで（撮影するときに取得します）
            </Button>
          </>
        )}
        {phase.kind === "downloading" && (
          <Button
            variant="ghost"
            onClick={() => {
              abortRef.current?.abort();
              onNext();
            }}
          >
            中止して次へ（撮影するときに取得します）
          </Button>
        )}
        {phase.kind === "error" && (
          <>
            {phase.items.length > 0 && (
              <Button size="lg" variant="outline" onClick={() => void download(phase.items)}>
                もう一度取得する
              </Button>
            )}
            <Button variant="ghost" onClick={onNext}>
              次へ
            </Button>
          </>
        )}
        {phase.kind === "ready" && (
          <>
            {state.status === "error" && (
              <Button size="lg" variant="outline" onClick={() => void run()}>
                もう一度測る
              </Button>
            )}
            <Button size="lg" disabled={running} onClick={onNext}>
              次へ
            </Button>
            {running && (
              <Button
                variant="ghost"
                onClick={() => {
                  bench.cancel();
                  onNext();
                }}
              >
                スキップ（あとで設定から測れます）
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
