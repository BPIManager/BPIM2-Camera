import { useCallback, useRef, useState } from "react";
import { registerBeatSeekerScore, revertBeatSeekerSubmission, toJstIso, type BeatSeekerPlay, type RegisterResult, type RevertResult } from "@/lib/beatSeeker/client";

/** beat-seeker への登録の状況 */
export type BeatSeekerSyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  /** 登録した。updated が false なら、どの記録も伸びず、何も書き換えていない。duplicate は、前回の登録の再送だった */
  | { kind: "saved"; submissionId: number; updated: boolean; duplicate: boolean }
  | { kind: "reverting"; submissionId: number }
  | { kind: "reverted" }
  | { kind: "error"; message: string };

/** 登録の失敗を、画面に出す日本語にする */
export function registerErrorMessage(r: Exclude<RegisterResult, { kind: "ok" }>): string {
  switch (r.kind) {
    case "invalid":
      return "トークンが無効です。設定の「アカウント連携 › beat-seeker」で貼り直してください";
    case "forbidden":
      return "このトークンには、スコアを登録する権限がありません。「スコア登録も許可」で発行し直してください";
    case "rate-limited":
      return "回数制限に達しました。少し待ってから、もう一度お試しください";
    case "rejected":
      return r.code === "CHART_NOT_FOUND" ? "この譜面は beat-seeker の楽曲に見つかりませんでした（曲名の表記が違う可能性があります）" : r.message;
    case "error":
      return r.message;
  }
}

/** 取り消しの失敗を、画面に出す日本語にする */
export function revertErrorMessage(r: Exclude<RevertResult, { kind: "ok" }>): string {
  switch (r.kind) {
    case "invalid":
      return "トークンが無効です。設定の「アカウント連携 › beat-seeker」で貼り直してください";
    case "forbidden":
      return "このトークンには、取り消しの権限がありません";
    case "conflict":
      return r.code === "ALREADY_REVERTED" ? "すでに取り消し済みです" : "あとから記録が変わっているので、取り消せません";
    case "error":
      return r.message;
  }
}

/**
 * 読み取ったスコアを beat-seeker に登録する（ボタンを押したときだけ。自動では送らない）。
 * 状況は、送る内容ごとに持つので、スコア・ランプ・ミスカウントなどを直したら、また送れる状態に戻る。
 * clientRequestId は、同じ内容の間は同じものを使う（通信が切れて再送しても、二重に登録されない）。取り消したあとは、新しいものにする。
 */
export function useBeatSeekerSync(token: string | null, play: BeatSeekerPlay | null, playedAtMs: number) {
  const [state, setState] = useState<{ key: string; status: BeatSeekerSyncStatus } | null>(null);
  const requestId = useRef<{ key: string; id: string } | null>(null);
  const key = token !== null && play !== null ? JSON.stringify(play) : null;

  /** 登録して、結果を返す（登録できる状態でなければ null）。画面の表示は status が持つ */
  const register = useCallback(async (): Promise<BeatSeekerSyncStatus | null> => {
    if (key === null || token === null || play === null) return null;
    if (requestId.current?.key !== key) requestId.current = { key, id: crypto.randomUUID() };
    setState({ key, status: { kind: "syncing" } });
    const r = await registerBeatSeekerScore(token, play, requestId.current.id, toJstIso(playedAtMs));
    const status: BeatSeekerSyncStatus = r.kind === "ok" ? { kind: "saved", submissionId: r.submissionId, updated: r.updated, duplicate: r.duplicate } : { kind: "error", message: registerErrorMessage(r) };
    setState({ key, status });
    return status;
  }, [key, token, play, playedAtMs]);

  /**
   * 登録を取り消す。登録番号を渡す（トーストの「取り消す」からも呼ぶので、そのときの状態に頼らない）。
   * 取り消せなかったときは、登録した状態のまま、理由を返す
   */
  const revert = useCallback(
    async (submissionId: number): Promise<RevertResult | null> => {
      if (key === null || token === null) return null;
      setState({ key, status: { kind: "reverting", submissionId } });
      const r = await revertBeatSeekerSubmission(token, submissionId);
      if (r.kind === "ok") {
        // 取り消したあとの登録は、別の登録として扱う
        requestId.current = null;
        setState({ key, status: { kind: "reverted" } });
      } else setState({ key, status: { kind: "saved", submissionId, updated: true, duplicate: false } });
      return r;
    },
    [key, token],
  );

  const status: BeatSeekerSyncStatus = key !== null && state?.key === key ? state.status : { kind: "idle" };
  return { status, register, revert, canRegister: key !== null };
}
