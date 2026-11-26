import { LATEST_VERSION } from "./client";

/**
 * BPIM2 にスコアを保存する先。最新バージョンと INFINITAS だけを選べる
 * （過去のバージョンへの保存は、記録の誤上書きにつながるので対象にしない）。
 */
export type SyncTarget = "latest" | "inf";

export const SYNC_TARGETS: readonly { id: SyncTarget; label: string; hint: string }[] = [
  { id: "latest", label: `最新バージョン（${LATEST_VERSION}）`, hint: "アーケードの最新バージョンの記録として保存" },
  { id: "inf", label: "INFINITAS", hint: "INFINITAS の記録として保存" },
];

export const DEFAULT_SYNC_TARGET: SyncTarget = "latest";

export const isSyncTarget = (v: unknown): v is SyncTarget => v === "latest" || v === "inf";

/** BPIM2 の API に渡すバージョン */
export const syncVersionOf = (target: SyncTarget): string => (target === "inf" ? "INF" : LATEST_VERSION);

export const syncTargetLabel = (target: SyncTarget): string => SYNC_TARGETS.find((t) => t.id === target)?.label ?? target;
