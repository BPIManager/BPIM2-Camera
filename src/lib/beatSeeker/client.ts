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
