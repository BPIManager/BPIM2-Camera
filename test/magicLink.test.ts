import { describe, expect, it, vi } from "vitest";
import { requestMagicLink } from "@/lib/firebase/magicLink";

const input = { email: "  Foo@Example.com ", turnstileToken: "tok", returnTo: "/", origin: "https://camera.example.com" };
const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });

describe("requestMagicLink", () => {
  it("BPIM2 の確認メール API に、アドレス・Turnstile のトークン・このアプリの signin.html を戻り先として POST する", async () => {
    const fetchImpl = respond(200, { error: false, body: { sent: true } });
    expect(await requestMagicLink(input, fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/bpim2-api/api/v2/auth/magic-link");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      email: "foo@example.com",
      turnstileToken: "tok",
      continueUrl: "https://camera.example.com/signin.html?returnTo=%2F",
    });
  });

  it("サーバーのエラーメッセージ（ボット確認の失敗・送信上限など）をそのまま返す", async () => {
    const r = await requestMagicLink(input, respond(403, { error: true, errorMessage: "ボット確認に失敗しました。再度お試しください" }));
    expect(r).toEqual({ ok: false, message: "ボット確認に失敗しました。再度お試しください" });
  });

  it("メッセージがなければ状態コードを、通信エラーなら通信の案内を返す", async () => {
    expect(await requestMagicLink(input, respond(429, null))).toEqual({ ok: false, message: "送信できませんでした（429）" });
    const r = await requestMagicLink(input, vi.fn().mockRejectedValue(new Error("offline")));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("通信");
  });
});
