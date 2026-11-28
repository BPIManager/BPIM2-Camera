/** 結果画面の、上のタブ。BPI（チャート・履歴・ランキング）か、beat-seeker */
export type ResultTab = "bpi" | "beat-seeker";

export const RESULT_TABS: readonly { id: ResultTab; label: string; hint: string }[] = [
  { id: "bpi", label: "BPI", hint: "チャート・履歴・ランキング" },
  { id: "beat-seeker", label: "beat-seeker", hint: "BEAT-PT・ティアの変動（連携しているときだけ）" },
];

export const DEFAULT_RESULT_TAB: ResultTab = "bpi";

export const isResultTab = (v: unknown): v is ResultTab => v === "bpi" || v === "beat-seeker";

/**
 * 結果画面を開いたときのタブ。beat-seeker を選んでいても、連携していなければ、案内しか出ないので BPI を開く
 */
export const initialResultTab = (preferred: ResultTab, beatSeekerLinked: boolean): ResultTab => (preferred === "beat-seeker" && beatSeekerLinked ? "beat-seeker" : "bpi");
