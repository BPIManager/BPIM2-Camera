import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isBenchmarkRunning, subscribeBenchmark } from "@/lib/recognition/benchmark";
import { createOcrSetup, type OcrBackend, type OcrSetup } from "@/lib/recognition/ocrSetup";
import { hasWebGpu } from "@/lib/recognition/paddle/webgpu";
import type { OcrEngine } from "@/lib/recognition/paddle/engine";
import type { Recognizer } from "@/lib/recognition/recognizer";
import type { SongMasterEntry } from "@/lib/songs/types";

/**
 * OCR のエンジン（Worker）を用意し、認識器を返す。モデルは撮影前に読み込んでおく。
 * 処理（GPU / CPU）は設定に従い、未設定なら WebGPU が使えれば GPU。設定が変わったら作り直す。
 * ベンチマークの間は Worker を止める（スマホで、モデルを何組もメモリに載せないため）。enabled が false の間も作らない。
 * getRecognizer は、その時点の認識器を返す。
 */
export function useOcrEngine(songs: readonly SongMasterEntry[], preferred: OcrBackend | null, enabled = true): { getRecognizer: () => Recognizer; getEngine: () => OcrEngine | null; backend: OcrBackend | null } {
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const setupRef = useRef<OcrSetup | null>(null);
  const benchmarking = useSyncExternalStore(subscribeBenchmark, isBenchmarkRunning);
  // 未設定のときに使う処理（WebGPU の有無を調べてから決まる）
  const [fallback, setFallback] = useState<OcrBackend | null>(null);
  useEffect(() => {
    if (preferred) return;
    let alive = true;
    void hasWebGpu().then((gpu) => alive && setFallback(gpu ? "gpu" : "cpu"));
    return () => {
      alive = false;
    };
  }, [preferred]);
  const backend = preferred ?? fallback;
  const active = enabled && !benchmarking && backend !== null;

  useEffect(() => {
    if (!active || !backend) return;
    const setup = createOcrSetup(backend, () => songsRef.current);
    setupRef.current = setup;
    void setup.warmUp().catch(() => undefined);
    return () => {
      setup.dispose();
      if (setupRef.current === setup) setupRef.current = null;
    };
  }, [active, backend]);

  return {
    getRecognizer: () => {
      if (!setupRef.current) throw new Error("OCR の準備ができていません。少し待ってから、もう一度お試しください");
      return setupRef.current.recognizer;
    },
    /** 画像全体を読む OCR（取り込みの枠の推定に使う）。準備ができていなければ null */
    getEngine: () => setupRef.current?.engine ?? null,
    /** 使っている処理（WebGPU の有無を調べ終わるまで null） */
    backend,
  };
}
