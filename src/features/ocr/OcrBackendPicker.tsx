import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import type { OcrBenchmarkResult } from "@/lib/recognition/benchmark";
import type { OcrBackend } from "@/lib/recognition/ocrSetup";
import { hasWebGpu } from "@/lib/recognition/paddle/webgpu";
import type { BenchmarkState } from "./useOcrBenchmark";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`;

/** この端末で WebGPU が使えるか（調べ終わるまで null） */
export function useWebGpuAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void hasWebGpu().then((v) => alive && setAvailable(v));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/** 読み取りの処理（GPU / CPU）の選択。ベンチマークの結果があれば、1 回の読み取りの時間を添える */
export function OcrBackendPicker({ value, onChange, benchmark }: { value: OcrBackend | null; onChange: (b: OcrBackend) => void; benchmark: OcrBenchmarkResult | null }) {
  const gpu = useWebGpuAvailable();
  const items: { id: OcrBackend; label: string; ms: number | null | undefined; disabled: boolean }[] = [
    { id: "gpu", label: gpu === false ? "GPU（使えません）" : "GPU", ms: benchmark?.gpuMs, disabled: gpu === false },
    { id: "cpu", label: "CPU", ms: benchmark?.cpuMs, disabled: false },
  ];
  return (
    <RadioGroup value={value ?? ""} onValueChange={(v) => (v === "gpu" || v === "cpu") && onChange(v)} aria-label="読み取りの処理">
      {items.map((it) => (
        <RadioItem key={it.id} value={it.id} disabled={it.disabled} className="h-14 px-2 text-sm disabled:opacity-50">
          <span className="flex flex-col items-center leading-tight">
            <span>{it.label}</span>
            {(it.ms != null || benchmark?.best === it.id) && (
              <span className="text-xs font-normal tabular-nums opacity-80">
                {[it.ms != null ? `1 回 ${seconds(it.ms)}` : null, benchmark?.best === it.id ? "おすすめ" : null].filter(Boolean).join("・")}
              </span>
            )}
          </span>
        </RadioItem>
      ))}
    </RadioGroup>
  );
}

/** ベンチマークの進み具合・結果 */
export function BenchmarkStatus({ state }: { state: BenchmarkState }) {
  if (state.status === "running")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {state.message}
      </p>
    );
  if (state.status === "error") return <p className="text-sm text-destructive">測れませんでした: {state.message}</p>;
  if (state.status === "done") {
    const r = state.result;
    return (
      <p className="text-sm text-muted-foreground" role="status">
        CPU {seconds(r.cpuMs)}・GPU {r.gpuMs === null ? "使えません" : seconds(r.gpuMs)}。{r.best === "gpu" ? "GPU" : "CPU"} を使います
      </p>
    );
  }
  return null;
}
