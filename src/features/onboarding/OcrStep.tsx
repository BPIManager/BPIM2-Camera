import { useEffect } from "react";
import { Gauge } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Button from "@/components/ui/button";
import { BenchmarkStatus, OcrBackendPicker } from "@/features/ocr/OcrBackendPicker";
import { useOcrBenchmark } from "@/features/ocr/useOcrBenchmark";
import type { Settings } from "@/lib/storage/settings";

/**
 * 読み取りの最適化。この端末で、サンプル画像を CPU と GPU で読んで速さを測り、速いほうを選ぶ。
 * 画面を開いたら自動で始める。測り終えたら、選び直すこともできる
 */
export function OcrStep({ settings, update, onNext }: { settings: Settings; update: (p: Partial<Settings>) => void; onNext: () => void }) {
  const bench = useOcrBenchmark((result) => update({ ocrBackend: result.best, ocrBenchmark: result }));
  const { state, run } = bench;
  // 開いたら 1 回だけ自動で測る（測り終えていれば、測り直さない）
  useEffect(() => {
    if (!settings.ocrBenchmark) void run();
  }, []);
  const running = state.status === "running";
  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-xl font-semibold">読み取りの最適化</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          この端末で、読み取りを CPU と GPU のどちらで行うと速いかを測り、速いほうを選びます。読み取りに使うモデル（数十 MB）もここで取得します。Wi-Fi でのご利用をおすすめします。
        </p>
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
      </div>
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 bg-background px-6 pt-3 pb-6">
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
      </div>
    </div>
  );
}
