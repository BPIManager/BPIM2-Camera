import type { OcrLine } from "@/lib/recognition/paddle/engine";
import type { OcrTrace } from "@/lib/recognition/recognizer";

export interface OcrDebugEntry {
  title: readonly OcrLine[];
  score: readonly (readonly OcrLine[])[];
  judge: readonly OcrLine[];
  /** 認識の結果（曲名・譜面・EX など）。読めなければ null */
  result: unknown;
  ms: number;
  steps: OcrTrace["steps"];
  resolvedAt: OcrTrace["resolvedAt"];
}

/** 設定画面のデバッグモード。オンの間だけ、読み取り結果を貯めて画面で見られるようにする（本番ビルドでも使える） */
let debugEnabled = false;
export const setDebugMode = (on: boolean): void => {
  debugEnabled = on;
  if (!on) entries = [];
  emit();
};

/** 画面で見るために貯める件数（新しい順に、これだけ残す） */
const MAX_ENTRIES = 10;
export interface DebugRecord extends OcrTrace {
  at: number;
}
let entries: DebugRecord[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const subscribeDebug = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getDebugRecords = (): readonly DebugRecord[] => entries;
export const clearDebugRecords = (): void => {
  entries = [];
  emit();
};

/**
 * 行の記録。`文字(確度)[x,y,幅,高さ]`。位置は、読んだ画像に対する 0〜1 の割合（切り出した枠の中での位置。
 * 傾きを直して読んだ曲名は、回転後の画像での位置）。読んだ画像の大きさが分からない行は、位置を付けない
 */
const ratio = (n: number, d: number) => Math.round((n / d) * 1000) / 1000;
const fmt = (lines: readonly OcrLine[]) =>
  lines.map((l) => {
    const base = `${l.text}(${Math.round(l.confidence)})`;
    const { size: s, box: b } = l;
    return s ? `${base}[${ratio(b.x, s.width)},${ratio(b.y, s.height)},${ratio(b.width, s.width)},${ratio(b.height, s.height)}]` : base;
  });

/** 読み取った行を、記録（文字と確度の文字列）にする */
export const toTrace = (e: OcrDebugEntry): OcrTrace => ({ title: fmt(e.title), score: e.score.map(fmt), judge: fmt(e.judge), result: e.result, ms: Math.round(e.ms), steps: e.steps, resolvedAt: e.resolvedAt });

const texts = (lines: readonly OcrLine[]) => lines.map((l) => `${l.text}(${Math.round(l.confidence)})`).join(" | ");

/** 任意のメッセージを、ブラウザのコンソールと開発サーバーのターミナルに残す（開発中だけ） */
export function logDebug(...lines: string[]): void {
  if (!import.meta.env.DEV) return;
  console.log("[ocr]", ...lines);
  void fetch("/__debug/ocr", { method: "POST", headers: { "content-type": "text/plain" }, body: lines.join(String.fromCharCode(10)), keepalive: true }).catch(() => undefined);
}

/**
 * 読み取れた文字を、デバッグ用に残す。ブラウザのコンソールに出し、開発サーバー（vite）が動いているときは、
 * そのターミナルにも送る（スマホで撮った結果を PC の画面で見られる）。本番ビルドでは何もしない。
 */
export function logOcr(e: OcrDebugEntry): void {
  if (debugEnabled) {
    entries = [{ at: Date.now(), ...toTrace(e) }, ...entries].slice(0, MAX_ENTRIES);
    emit();
  }
  if (!import.meta.env.DEV) return;
  const lines = [
    `title : ${texts(e.title)}`,
    ...e.score.map((s, i) => `score${i + 1}: ${texts(s)}`),
    `judge : ${texts(e.judge)}`,
    `result: ${JSON.stringify(e.result)}  (${Math.round(e.ms)}ms)`,
  ];
  logDebug(...lines);
}

/** 撮影した画像と切り出し画像を、開発サーバー（internal/captures）に保存する。枠のずれや画質の確認用 */
export function saveCaptures(prefix: string, blobs: Record<string, Blob>): void {
  if (!import.meta.env.DEV) return;
  for (const [key, blob] of Object.entries(blobs)) {
    const ext = blob.type.includes("png") ? "png" : "jpg";
    void fetch(`/__debug/img?name=${encodeURIComponent(`${prefix}_${key}.${ext}`)}`, { method: "POST", body: blob, keepalive: false }).catch(() => undefined);
  }
}
