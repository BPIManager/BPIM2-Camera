import { describe, expect, it, vi } from "vitest";
import { describeBody, describeUrl, shouldSkip, wantsBody, wrapFetch } from "@/lib/debug/netLog";

describe("通信ログ：記録するもの・しないもの", () => {
  it("ログの送信そのもの・開発サーバーの配信・大きな取得は記録しない", () => {
    expect(shouldSkip("/__debug/ocr")).toBe(true);
    expect(shouldSkip("https://www.google-analytics.com/g/collect?v=2&cid=1")).toBe(true);
    expect(shouldSkip("https://www.googletagmanager.com/gtag/js?id=G-X")).toBe(true);
    expect(shouldSkip("http://localhost:5173/src/main.tsx")).toBe(true);
    expect(shouldSkip("/node_modules/.vite/deps/react.js?v=1")).toBe(true);
    expect(shouldSkip("/models/paddle/det.onnx")).toBe(true);
    expect(shouldSkip("blob:http://x/1")).toBe(true);
    expect(shouldSkip("/bpim2-api/api/v2/songs/search?title=x")).toBe(false);
    expect(shouldSkip("/beat-seeker-api/api/external/v1/me")).toBe(false);
  });

  it("本文まで残すのは、beat-seeker のすべてと、BPIM2 の scores/manual だけ（ほかの人の情報を含む取得は、本文を残さない）", () => {
    expect(wantsBody("/beat-seeker-api/api/external/v1/scores/preview")).toBe(true);
    expect(wantsBody("https://beat-seeker.onrender.com/api/external/v1/me")).toBe(true);
    expect(wantsBody("/bpim2-api/api/v2/users/u1/scores/manual")).toBe(true);
    expect(wantsBody("/bpim2-api/api/v2/users/u1/scores/5/history")).toBe(false);
    expect(wantsBody("/bpim2-api/api/v2/users/u1/rivals/following/scores/9?version=34")).toBe(false);
  });

  it("URL は、同じオリジンならパスだけ。API キーなどのクエリは伏せる", () => {
    expect(describeUrl("http://localhost:5173/bpim2-api/api/v2/songs/search?title=x", "http://localhost:5173/")).toBe("/bpim2-api/api/v2/songs/search?title=x");
    expect(describeUrl("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSECRET", "http://localhost:5173/")).toBe("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=***");
  });

  it("本文は 1 行にして、トークンなどの項目は伏せ、長ければ切る", () => {
    expect(describeBody('{\n  "title": "冥",\n  "token": "bs_live_x"\n}')).toBe('{"title":"冥","token":"***"}');
    expect(describeBody("plain  text\n")).toBe("plain text");
    const long = describeBody(JSON.stringify({ a: "x".repeat(2000) }));
    expect(long.length).toBeLessThan(1600);
    expect(long).toContain("文字）");
  });
});

describe("fetch を包む", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("送った内容と返ってきた内容を記録し、返す値はそのまま。認証のヘッダー（トークン）は記録しない", async () => {
    const log = vi.fn();
    const original = vi.fn().mockResolvedValue(json(200, { submissionId: 7, updated: true }));
    let t = 0;
    const f = wrapFetch(original as unknown as typeof fetch, log, () => (t += 250));
    const res = await f("/beat-seeker-api/api/external/v1/scores", { method: "POST", headers: { Authorization: "Bearer bs_live_SECRET" }, body: JSON.stringify({ title: "冥", exScore: 1600 }) });
    expect(await res.json()).toEqual({ submissionId: 7, updated: true });
    const lines = log.mock.calls.map((c) => c[0] as string);
    expect(lines[0]).toContain("#1 → POST /beat-seeker-api/api/external/v1/scores");
    expect(lines[0]).toContain('送信: {"title":"冥","exScore":1600}');
    expect(lines[1]).toContain("#1 ← 200 250ms");
    expect(lines[1]).toContain('返答: {"submissionId":7,"updated":true}');
    expect(lines.join("\n")).not.toContain("SECRET");
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("本文を残さない通信は、メソッド・URL・状態・時間だけ。本文を読んでも、呼び出し側が読めなくならない", async () => {
    const log = vi.fn();
    const f = wrapFetch(vi.fn().mockResolvedValue(json(200, { other: "players" })) as unknown as typeof fetch, log, () => 0);
    const res = await f("/bpim2-api/api/v2/users/u1/scores/5/history");
    expect(await res.json()).toEqual({ other: "players" });
    expect(log.mock.calls.map((c) => c[0]).join("\n")).not.toContain("players");
    const g = wrapFetch(vi.fn().mockResolvedValue(json(200, { ok: 1 })) as unknown as typeof fetch, log, () => 0);
    expect(await (await g("/beat-seeker-api/api/external/v1/me")).json()).toEqual({ ok: 1 });
  });

  it("失敗は、理由を記録して、そのまま投げ直す。記録しない通信は、何も記録しない", async () => {
    const log = vi.fn();
    const f = wrapFetch(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch, log, () => 0);
    await expect(f("/bpim2-api/api/v2/songs/search")).rejects.toThrow("Failed to fetch");
    expect(log.mock.calls.at(-1)?.[0]).toContain("✗");
    expect(log.mock.calls.at(-1)?.[0]).toContain("TypeError: Failed to fetch");
    const quiet = vi.fn();
    const g = wrapFetch(vi.fn().mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch, quiet, () => 0);
    await g("/__debug/ocr", { method: "POST", body: "x" });
    expect(quiet).not.toHaveBeenCalled();
  });
});
