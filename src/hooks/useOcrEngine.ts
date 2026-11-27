import { useEffect, useRef } from "react";
import { TesseractRecognizer } from "@/lib/recognition/ocr/tesseractRecognizer";
import { EnginePool } from "@/lib/recognition/paddle/enginePool";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import { hasWebGpu } from "@/lib/recognition/paddle/webgpu";
import { WorkerOcrEngine } from "@/lib/recognition/paddle/workerEngine";
import type { Recognizer } from "@/lib/recognition/recognizer";
import type { SongMasterEntry } from "@/lib/songs/types";

/** 曲名用の Worker と、（CPU のとき）スコア欄・判定表用の Worker から、認識器を作る */
function createRecognizer(getMaster: () => readonly SongMasterEntry[], titleWorker: WorkerOcrEngine, passWorker?: WorkerOcrEngine): Recognizer {
  // 枠で撮った画像は PaddleOCR、全体画像の取り込みは Tesseract で読む
  return new PaddleRecognizer(titleWorker, getMaster, new TesseractRecognizer(getMaster), {
    passEngine: passWorker && new EnginePool([passWorker]),
    ahead: passWorker ? Number.POSITIVE_INFINITY : 0,
  });
}

/**
 * OCR のエンジン（Worker）を用意し、認識器を返す。モデルは撮影前に読み込んでおく。
 * WebGPU があれば GPU で読む（Worker 1 つ。GPU は 1 つずつしか読めないので、分けても速くならない）。
 * なければ CPU で、曲名と、スコア欄・判定表を、別々の Worker で同時に読む（実機で約 25% 速い）。
 * 返す関数は、その時点の認識器を返す（GPU の有無が分かると作り直すため）。
 */
export function useOcrEngine(songs: readonly SongMasterEntry[]): () => Recognizer {
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const recognizerRef = useRef<Recognizer | null>(null);

  useEffect(() => {
    const getMaster = () => songsRef.current;
    const titleWorker = new WorkerOcrEngine();
    const workers = [titleWorker];
    recognizerRef.current = createRecognizer(getMaster, titleWorker);
    let disposed = false;
    void titleWorker.warmUp().catch(() => undefined);
    void hasWebGpu().then((gpu) => {
      if (gpu || disposed) return;
      const passWorker = new WorkerOcrEngine();
      workers.push(passWorker);
      void passWorker.warmUp().catch(() => undefined);
      recognizerRef.current = createRecognizer(getMaster, titleWorker, passWorker);
    });
    return () => {
      disposed = true;
      for (const w of workers) w.dispose();
      recognizerRef.current = null;
    };
  }, []);

  return () => {
    if (!recognizerRef.current) throw new Error("OCR の準備ができていません");
    return recognizerRef.current;
  };
}
