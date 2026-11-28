/**
 * 開発中だけ、ブラウザの通信（fetch）を、開発サーバー（PC のターミナルと internal/debug.log）に残す。
 * tailscale 経由でスマホから動かしているときに、何を送って何が返ってきたかを、PC で見るため（本番ビルドでは何もしない）。
 * 認証のヘッダー（トークン）は残さない
 */

/** 本文まで残す通信の長さの上限（文字） */
const BODY_LIMIT = 1500;

/** 記録しない通信：広告計測（識別子を含み、ノイズになる）・ログの送信そのもの・開発サーバーの配信・モデルなどの大きな取得・画像などの埋め込み */
const SKIP = [/google-analytics\.com|googletagmanager\.com/, /\/__debug\//, /\/@(vite|fs|id|react-refresh)/, /\/src\//, /\/node_modules\//, /\/models\//, /\.(wasm|onnx|map|css|js|mjs|png|jpg|jpeg|svg|ico|woff2?)(\?|$)/];

export const shouldSkip = (url: string): boolean => /^(blob|data):/.test(url) || SKIP.some((re) => re.test(url));

/**
 * 本文（送った内容・返ってきた内容）まで残す通信：beat-seeker のすべてと、BPIM2 のスコアの保存・プレビュー（scores/manual）。
 * BPIM2 のほかの取得（履歴・ライバル・プロフィールなど）は、他の人の情報を含むので、本文は残さない
 */
export const wantsBody = (url: string): boolean => /\/beat-seeker-api\/|beat-seeker\.(onrender\.)?com\//.test(url) || /\/scores\/manual(\?|$)/.test(url);

/** 同じオリジンなら、パスだけ。ほかのオリジンなら、オリジンから。クエリの key（API キー）は伏せる */
export function describeUrl(url: string, base = "http://localhost/"): string {
  try {
    const u = new URL(url, base);
    u.searchParams.forEach((_v, k) => /^(key|token|access_token|id_token)$/i.test(k) && u.searchParams.set(k, "***"));
    return u.origin === new URL(base).origin ? `${u.pathname}${u.search}` : `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** 本文を 1 行にして、長ければ切る。トークン・パスワードなどの項目は伏せる（JSON のとき） */
export function describeBody(text: string): string {
  let out = text;
  try {
    out = JSON.stringify(JSON.parse(text), (k, v) => (/token|secret|password|authorization/i.test(k) ? "***" : v));
  } catch {
    /* JSON でなければ、そのまま */
  }
  out = out.replace(/\s+/g, " ").trim();
  return out.length > BODY_LIMIT ? `${out.slice(0, BODY_LIMIT)}…（${out.length} 文字）` : out;
}

/** fetch に渡された本文を、文字列にする（文字列以外は、種類だけ） */
const bodyText = (body: BodyInit | null | undefined): string | null => {
  if (body === null || body === undefined) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return `(${body instanceof Blob ? `Blob ${body.size}B` : Object.prototype.toString.call(body).slice(8, -1)})`;
};

/**
 * fetch を包んで、送った・返ってきた・失敗したを記録する。log には、1 行の文字列を渡す。
 * 呼び出し側には、何も影響しない（返す値・投げるエラーは、そのまま）
 */
export function wrapFetch(original: typeof fetch, log: (message: string) => void, now: () => number = () => performance.now()): typeof fetch {
  let seq = 0;
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (shouldSkip(url)) return original(input, init);
    const id = ++seq;
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const body = wantsBody(url);
    const sent = body ? bodyText(init?.body) : null;
    const t0 = now();
    log(`#${id} → ${method} ${describeUrl(url, typeof location === "undefined" ? undefined : location.href)}${sent ? ` 送信: ${describeBody(sent)}` : ""}`);
    try {
      const res = await original(input, init);
      const text = body ? await res.clone().text().catch(() => "") : "";
      log(`#${id} ← ${res.status} ${Math.round(now() - t0)}ms${text ? ` 返答: ${describeBody(text)}` : ""}`);
      return res;
    } catch (e) {
      log(`#${id} ✗ ${Math.round(now() - t0)}ms ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
      throw e;
    }
  };
}
