/** 中止（AbortController.abort）による失敗か */
export const isAbortError = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

/**
 * 処理の結果を待つが、signal が中止されたら、処理の完了を待たずにすぐ失敗にする。
 * 中止された処理が遅れて失敗しても、未処理のエラーにならないようにする（中止後の結果は使わない）。
 */
export function raceAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  task.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    task.then(resolve, reject);
  });
}
