import type { AssetProgress } from "./assetStore";

/**
 * OCR のファイル（モデル・ランタイム）の取得の進み具合を集める。Worker から届いた知らせを、画面の進み具合の表示に渡す。
 * 取得し終えたものも、すべて終わるまでは残す（全体の進み具合に含めるため）。すべて終わったら空にする
 */
let current = new Map<string, AssetProgress>();
let snapshot: readonly AssetProgress[] = [];
const listeners = new Set<() => void>();

export function reportDownload(p: AssetProgress): void {
  current = new Map(current).set(p.url, p);
  if ([...current.values()].every((x) => x.done)) {
    snapshot = [...current.values()];
    current = new Map();
  } else snapshot = [...current.values()];
  for (const l of listeners) l();
}

export const getDownloads = (): readonly AssetProgress[] => snapshot;
export function subscribeDownloads(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
