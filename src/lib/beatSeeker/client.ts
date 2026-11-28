import type { ClearType, Difficulty } from "@/lib/domain/types";
import { LATEST_VERSION } from "@/lib/bpi/client";

/**
 * beat-seeker の外部連携 API（docs: camera-score-api.md）。トークンは端末にだけ置き、ブラウザから直接呼ぶ（BPIM2 の中継は通さない）。
 * 開発サーバー（localhost・tailscale）は beat-seeker の CORS の許可リストにないので、開発中だけ vite の中継（/beat-seeker-api）を通す。
 * 中継は手元の PC の開発サーバーで、本番のビルドは直接呼ぶ
 */
export const BEAT_SEEKER_API = import.meta.env.DEV ? "/beat-seeker-api" : "https://beat-seeker.onrender.com";

/** トークンを発行する beat-seeker のサイト */
export const BEAT_SEEKER_URL = "https://beat-seeker.com";

/** トークンは bs_live_ で始まる */
export const TOKEN_PREFIX = "bs_live_";

/** スコアを登録できる権限 */
export const WRITE_SCOPE = "scores:write";

/** トークンの持ち主と権限（GET /me） */
export interface BeatSeekerMe {
  iidxId: string;
  displayName: string;
  scopes: string[];
}

export type MeResult =
  | { kind: "ok"; me: BeatSeekerMe }
  /** トークンが無い・無効・失効・期限切れ */
  | { kind: "invalid" }
  | { kind: "error"; message: string };

/**
 * サーバーが止まっていると、起きるまで数十秒かかることがある（Render）。それより長く待っても返らなければ諦める
 */
const ME_TIMEOUT_MS = 60_000;

/** トークンを確かめる（GET /api/external/v1/me）。Cookie は使わない */
export async function fetchMe(token: string, fetchImpl: typeof fetch = fetch, timeoutMs = ME_TIMEOUT_MS): Promise<MeResult> {
  try {
    const res = await fetchImpl(`${BEAT_SEEKER_API}/api/external/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) return { kind: "invalid" };
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { kind: "error", message: body?.error ?? `HTTP ${res.status}` };
    }
    const me = (await res.json()) as Partial<BeatSeekerMe>;
    if (typeof me.iidxId !== "string" || typeof me.displayName !== "string") return { kind: "error", message: "応答の形が想定と違います" };
    return { kind: "ok", me: { iidxId: me.iidxId, displayName: me.displayName, scopes: Array.isArray(me.scopes) ? me.scopes.filter((s) => typeof s === "string") : [] } };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") return { kind: "error", message: "beat-seeker から応答がありません。少し待ってから、もう一度お試しください" };
    return { kind: "error", message: "beat-seeker に接続できませんでした" };
  }
}

/** 貼り付けたトークンを整える（前後の空白・改行を除く） */
export const normalizeToken = (text: string) => text.trim();

/** トークンの形が正しいか（bs_live_ で始まり、空白を含まない） */
export const looksLikeToken = (token: string) => token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length && !/\s/.test(token);

/** beat-seeker に送る、1 プレー分の内容（preview・登録で共通） */
export interface BeatSeekerPlay {
  /** 公式 CSV の曲名表記と完全一致する曲名 */
  title: string;
  difficulty: Difficulty;
  exScore: number;
  /** PGREAT・GREAT は両方送るか、両方送らない。EX と合わないと 400 になるので、合うときだけ渡す */
  judge: { pgreat: number; great: number } | null;
  clearType: ClearType;
  missCount: number | null;
}

/** 数値の変動（登録前・登録後・差分） */
interface Change {
  before: number | null;
  after: number | null;
}

/** BEAT-PT・Rate-Tier の変動。chart はこの譜面単体（対象外の譜面は null）、total は上位譜面の合計、tier はティア名 */
export interface PtChange {
  chart: Change | null;
  total: Change & { delta: number | null };
  tier: { before: string | null; after: string | null };
}

/** 登録した場合の結果と変動幅（POST /scores/preview）。何も保存されない */
export interface BeatSeekerPreview {
  chart: { title: string; level: number; unofficialLevel: string | null };
  /** 項目ごとに、記録が伸びるか */
  improved: { exScore: boolean; clearType: boolean; missCount: boolean };
  /** 登録すると記録が書き換わるか */
  willUpdate: boolean;
  beatPt: PtChange;
  ratePt: PtChange;
}

export type PreviewResult =
  | { kind: "ok"; preview: BeatSeekerPreview }
  /** トークンが無効（401） */
  | { kind: "invalid" }
  /** 回数制限（429） */
  | { kind: "rate-limited" }
  /** 送った内容を受け付けない（400・404）。code は beat-seeker のエラーコード（CHART_NOT_FOUND など）、message は表示してよい日本語 */
  | { kind: "rejected"; code: string; message: string }
  | { kind: "error"; message: string };

/**
 * 判定内訳（PGREAT・GREAT）を、送ってよいときだけ返す。beat-seeker は PGREAT×2+GREAT = EX と PGREAT+GREAT ≦ ノーツ数を検算し、
 * 合わないと 400 にする。読み取りの誤りや、EX を手で直したあとは合わないので、そのときは送らない（判定内訳は任意）
 */
export function consistentJudge(judge: { pgreat: number; great: number } | null, exScore: number, notes: number): { pgreat: number; great: number } | null {
  if (!judge) return null;
  return judge.pgreat * 2 + judge.great === exScore && judge.pgreat + judge.great <= notes ? { pgreat: judge.pgreat, great: judge.great } : null;
}

/** 現行作の作品番号（beat-seeker は整数で受け取る） */
const CURRENT_VERSION = Number(LATEST_VERSION);

/** 送る本文。FAILED のときのミスカウントは、途中で落ちた値で意味がないので送らない */
export function playBody(play: BeatSeekerPlay) {
  return {
    title: play.title,
    playStyle: "SP",
    difficulty: play.difficulty,
    exScore: play.exScore,
    ...(play.judge ? { pgreat: play.judge.pgreat, great: play.judge.great } : {}),
    clearType: play.clearType,
    ...(play.missCount !== null && play.clearType !== "FAILED" ? { missCount: play.missCount } : {}),
    version: CURRENT_VERSION,
  };
}

const PREVIEW_TIMEOUT_MS = 60_000;

/** 登録した場合の変動幅を取る（保存しない）。トークンは登録権限がなくてもよい */
export async function previewBeatSeekerScore(token: string, play: BeatSeekerPlay, fetchImpl: typeof fetch = fetch, timeoutMs = PREVIEW_TIMEOUT_MS): Promise<PreviewResult> {
  try {
    const res = await fetchImpl(`${BEAT_SEEKER_API}/api/external/v1/scores/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(playBody(play)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) return { kind: "invalid" };
    if (res.status === 429) return { kind: "rate-limited" };
    const body = (await res.json().catch(() => null)) as (Partial<BeatSeekerPreview> & { code?: string; error?: string }) | null;
    if (res.status === 400 || res.status === 404) return { kind: "rejected", code: body?.code ?? "", message: body?.error ?? `HTTP ${res.status}` };
    if (!res.ok) return { kind: "error", message: body?.error ?? `HTTP ${res.status}` };
    if (!body?.chart || !body.beatPt || !body.ratePt || !body.improved) return { kind: "error", message: "応答の形が想定と違います" };
    return { kind: "ok", preview: body as BeatSeekerPreview };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") return { kind: "error", message: "beat-seeker から応答がありません" };
    return { kind: "error", message: "beat-seeker に接続できませんでした" };
  }
}

/** 登録の結果（POST /scores）。updated が false なら、どの記録も伸びず、何も書き換えていない */
export type RegisterResult =
  | { kind: "ok"; submissionId: number; updated: boolean; duplicate: boolean }
  /** トークンが無効（401） */
  | { kind: "invalid" }
  /** 登録の権限がない（403。「読み取りのみ」で発行したトークン） */
  | { kind: "forbidden" }
  | { kind: "rate-limited" }
  /** 送った内容を受け付けない（400・404）。message は表示してよい日本語 */
  | { kind: "rejected"; code: string; message: string }
  | { kind: "error"; message: string };

/** 撮影日時を、+09:00 付きの ISO 8601 にする（beat-seeker は +09:00 を求める。例 2026-11-28T21:03:00+09:00） */
export function toJstIso(ms: number): string {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.toISOString().slice(0, 19)}+09:00`;
}

/**
 * スコアを登録する（POST /scores）。clientRequestId は、登録 1 件ごとに一意で、再送のときは同じものを使う（二重に登録しないため）。
 * 一度入った記録は、あとから正しい値で上書きできない（取り消しだけ）ので、送る前に、画面で確認してもらう
 */
export async function registerBeatSeekerScore(token: string, play: BeatSeekerPlay, clientRequestId: string, playedAt: string, fetchImpl: typeof fetch = fetch, timeoutMs = PREVIEW_TIMEOUT_MS): Promise<RegisterResult> {
  try {
    const res = await fetchImpl(`${BEAT_SEEKER_API}/api/external/v1/scores`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...playBody(play), playedAt, clientRequestId }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) return { kind: "invalid" };
    if (res.status === 403) return { kind: "forbidden" };
    if (res.status === 429) return { kind: "rate-limited" };
    const body = (await res.json().catch(() => null)) as { submissionId?: unknown; updated?: unknown; duplicate?: unknown; code?: string; error?: string } | null;
    if (res.status === 400 || res.status === 404) return { kind: "rejected", code: body?.code ?? "", message: body?.error ?? `HTTP ${res.status}` };
    if (!res.ok) return { kind: "error", message: body?.error ?? `HTTP ${res.status}` };
    if (typeof body?.submissionId !== "number") return { kind: "error", message: "応答の形が想定と違います" };
    return { kind: "ok", submissionId: body.submissionId, updated: body.updated === true, duplicate: body.duplicate === true };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") return { kind: "error", message: "beat-seeker から応答がありません（登録されたかは、beat-seeker で確かめてください）" };
    return { kind: "error", message: "beat-seeker に接続できませんでした" };
  }
}

/** 取り消しの結果（DELETE /scores/submissions/{id}） */
export type RevertResult =
  | { kind: "ok" }
  /** あとから別の登録や取り込みで記録が変わっていて、取り消せない（409 CHANGED_SINCE）／すでに取り消し済み（409 ALREADY_REVERTED） */
  | { kind: "conflict"; code: string; message: string }
  | { kind: "invalid" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

/** 登録を取り消し、その譜面の記録を登録前の状態に戻す（その譜面の記録が、登録直後のままのときだけ） */
export async function revertBeatSeekerSubmission(token: string, submissionId: number, fetchImpl: typeof fetch = fetch, timeoutMs = PREVIEW_TIMEOUT_MS): Promise<RevertResult> {
  try {
    const res = await fetchImpl(`${BEAT_SEEKER_API}/api/external/v1/scores/submissions/${submissionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401) return { kind: "invalid" };
    if (res.status === 403) return { kind: "forbidden" };
    const body = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
    if (res.status === 409) return { kind: "conflict", code: body?.code ?? "", message: body?.error ?? "取り消せませんでした" };
    if (!res.ok) return { kind: "error", message: body?.error ?? `HTTP ${res.status}` };
    return { kind: "ok" };
  } catch {
    return { kind: "error", message: "beat-seeker に接続できませんでした" };
  }
}
