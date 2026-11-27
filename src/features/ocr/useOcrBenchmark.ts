import { useEffect, useRef, useState } from "react";
import { useMaster } from "@/hooks/useMaster";
import { runOcrBenchmark, type BenchmarkProgress, type OcrBenchmarkResult } from "@/lib/recognition/benchmark";
import { isAbortError } from "@/lib/async/abort";

export type BenchmarkState =
  | { status: "idle" }
  | { status: "running"; message: string }
  | { status: "done"; result: OcrBenchmarkResult }
  | { status: "error"; message: string };

const NAME = { cpu: "CPU", gpu: "GPU" } as const;

function describe(p: BenchmarkProgress): string {
  if (p.phase === "prepare") return `${NAME[p.backend]} の準備をしています（初回はモデルを取得するので、時間がかかります）`;
  if (p.phase === "read") return `${NAME[p.backend]} で読んでいます（${p.run}/${p.runs}）`;
  return "測り終えました";
}

/** 端末のベンチマーク（CPU と GPU の読み取りの速さ）を走らせる。画面を離れたら中止する */
export function useOcrBenchmark(onDone: (result: OcrBenchmarkResult) => void) {
  const { songs } = useMaster();
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [state, setState] = useState<BenchmarkState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "running", message: "準備しています" });
    try {
      const result = await runOcrBenchmark(() => songsRef.current, (p) => setState({ status: "running", message: describe(p) }), controller.signal);
      setState({ status: "done", result });
      onDoneRef.current(result);
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) {
        setState({ status: "idle" });
        return;
      }
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return { state, run, cancel: () => abortRef.current?.abort() };
}
