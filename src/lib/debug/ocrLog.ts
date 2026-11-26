import type { OcrLine } from "@/lib/recognition/paddle/engine";

export interface OcrDebugEntry {
  title: readonly OcrLine[];
  score: readonly (readonly OcrLine[])[];
  judge: readonly OcrLine[];
  /** 認識の結果（曲名・譜面・EX など）。読めなければ null */
  result: unknown;
  ms: number;
}

const texts = (lines: readonly OcrLine[]) => lines.map((l) => `${l.text}(${Math.round(l.confidence)})`).join(" | ");

/**
 * 読み取れた文字を、デバッグ用に残す。ブラウザのコンソールに出し、開発サーバー（vite）が動いているときは、
 * そのターミナルにも送る（スマホで撮った結果を PC の画面で見られる）。本番ビルドでは何もしない。
 */
export function logOcr(e: OcrDebugEntry): void {
  if (!import.meta.env.DEV) return;
  const lines = [
    `title : ${texts(e.title)}`,
    ...e.score.map((s, i) => `score${i + 1}: ${texts(s)}`),
    `judge : ${texts(e.judge)}`,
    `result: ${JSON.stringify(e.result)}  (${Math.round(e.ms)}ms)`,
  ];
  console.groupCollapsed("[ocr] 読み取り結果");
  for (const l of lines) console.log(l);
  console.groupEnd();
  void fetch("/__debug/ocr", { method: "POST", headers: { "content-type": "text/plain" }, body: lines.join("\n"), keepalive: true }).catch(() => undefined);
}
