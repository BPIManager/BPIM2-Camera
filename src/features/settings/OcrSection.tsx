import Button from "@/components/ui/button";
import Label from "@/components/ui/label";
import { BenchmarkStatus, OcrBackendPicker } from "@/features/ocr/OcrBackendPicker";
import { useOcrBenchmark } from "@/features/ocr/useOcrBenchmark";
import type { Settings } from "@/lib/storage/settings";

/** 読み取りの処理（GPU / CPU）の選択と、ベンチマークの再実行 */
export default function OcrSection({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const { state, run } = useOcrBenchmark((result) => update({ ocrBackend: result.best, ocrBenchmark: result }));
  const running = state.status === "running";
  return (
    <div className="flex flex-col gap-2 border-b border-border py-3">
      <Label>読み取りの処理</Label>
      <p className="text-xs text-muted-foreground">
        GPU が使える端末では、多くの場合 GPU のほうが速く読めます。「測る」で、この端末で実際に読んで速いほうを選びます（数十秒かかります。測っている間は撮影できません）
      </p>
      <OcrBackendPicker value={settings.ocrBackend} onChange={(ocrBackend) => update({ ocrBackend })} benchmark={settings.ocrBenchmark} />
      <BenchmarkStatus state={state} />
      <Button variant="outline" disabled={running} onClick={() => void run()}>
        {running ? "測っています" : settings.ocrBenchmark ? "測り直す" : "測る"}
      </Button>
    </div>
  );
}
