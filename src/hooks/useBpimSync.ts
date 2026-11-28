import { useCallback, useState } from "react";
import { syncScore, type SyncExtras, type SyncResult } from "@/lib/bpi/songData";
import type { ChartRef } from "@/lib/domain/types";

export type SyncStatus = { kind: "idle" } | { kind: "syncing" } | SyncResult;

/**
 * 読み取ったスコアを BPIM2 に保存する（ボタンを押したときだけ。自動では送らない）。
 * 状況は「曲・スコア・使用オプション・ミスカウント・保存先」ごとに持つので、どれかを変えたら、また押せる状態に戻る。
 * canSync は、サインイン中で、曲とスコアが決まっているとき true。
 */
export function useBpimSync(userId: string | null, chart: ChartRef | null, exScore: number | null, version: string, extras: SyncExtras = { useOption: null, missCount: null }) {
  const [state, setState] = useState<{ key: string; status: SyncStatus } | null>(null);
  const { useOption, missCount } = extras;
  const key = userId !== null && chart !== null && exScore !== null ? `${userId}:${chart.songId}:${exScore}:${version}:${useOption ?? ""}:${missCount ?? ""}` : null;

  /** 保存して、結果を返す（保存できる状態でなければ null）。画面の表示は status が持つ */
  const sync = useCallback(async (): Promise<SyncResult | null> => {
    if (key === null || userId === null || chart === null || exScore === null) return null;
    setState({ key, status: { kind: "syncing" } });
    const result = await syncScore(userId, chart, exScore, version, { useOption, missCount });
    setState({ key, status: result });
    return result;
  }, [key, userId, chart, exScore, version, useOption, missCount]);

  const status: SyncStatus = key !== null && state?.key === key ? state.status : { kind: "idle" };
  return { status, sync, canSync: key !== null };
}
