/** 同一オリジンの中継（vite.config.ts / README 参照）。BPIM2 API の /api/v2/me は CORS 非対応なので、直接は呼べない */
export const BPIM2_API_PROXY = "/bpim2-api";

export interface Bpim2Profile {
  userName: string;
  profileImage: string | null;
  /** アリーナのランク（A1〜A5 など）。非公開・未設定は null */
  arenaRank: string | null;
}

interface MeResponse {
  error: boolean;
  body: { exists: boolean; user: { userName?: string; profileImage?: string | null; arenaRank?: string | null } | null } | null;
}

/** サインイン中ユーザーの BPIM2 上のユーザー名とアイコン。BPIM2 に未登録・取得失敗は null */
export async function fetchBpim2Profile(idToken: string, fetchImpl: typeof fetch = fetch): Promise<Bpim2Profile | null> {
  try {
    const res = await fetchImpl(`${BPIM2_API_PROXY}/api/v2/me`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) return null;
    const json = (await res.json()) as MeResponse;
    const user = json.body?.exists ? json.body.user : null;
    return user?.userName ? { userName: user.userName, profileImage: user.profileImage || null, arenaRank: user.arenaRank || null } : null;
  } catch {
    return null;
  }
}
