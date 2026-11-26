import { BPIM2_API_PROXY } from "@/lib/bpi/me";
import { normalizeEmail } from "./email";

export type MagicLinkResult = { ok: true } | { ok: false; message: string };

/**
 * BPIM2 の確認メール API（POST /auth/magic-link）に、サインイン用のリンクを送ってもらう。
 * Turnstile のトークンは BPIM2 のサーバーが検証する。リンクの戻り先は、このアプリの signin.html（BPIM2 が許可したオリジンのみ）。
 */
export async function requestMagicLink(
  input: { email: string; turnstileToken: string; returnTo?: string; origin: string },
  fetchImpl: typeof fetch = fetch,
): Promise<MagicLinkResult> {
  const continueUrl = `${input.origin}/signin.html?returnTo=${encodeURIComponent(input.returnTo ?? "/")}`;
  try {
    const res = await fetchImpl(`${BPIM2_API_PROXY}/api/v2/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizeEmail(input.email), turnstileToken: input.turnstileToken, continueUrl }),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as { errorMessage?: string | null; message?: string } | null;
    return { ok: false, message: json?.errorMessage ?? json?.message ?? `送信できませんでした（${res.status}）` };
  } catch {
    return { ok: false, message: "通信できませんでした。接続を確認してください" };
  }
}
