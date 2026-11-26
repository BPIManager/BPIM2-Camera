/**
 * S3 互換（R2）向けの SigV4 クエリ署名。依存を増やさないよう WebCrypto だけで書く。
 * 本文は署名しない（UNSIGNED-PAYLOAD）。署名するヘッダーは host と、渡されたもの（content-type など）
 */

export interface PresignInput {
  method: "GET" | "PUT";
  host: string;
  /** `/bucket/key` の形。各区切りは英数字と `_.-~` だけを想定（呼び出し側で検証する） */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  /** 署名に含めるヘッダー（小文字名）。クライアントは同じ値で送ること */
  headers?: Record<string, string>;
  expiresIn: number;
  now: Date;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 に従う URI エンコード（SigV4 の規定。`!'()*` も符号化する） */
const uriEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export async function presignUrl(input: PresignInput): Promise<string> {
  const service = input.service ?? "s3";
  const amzDate = input.now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/${service}/aws4_request`;

  const headers: Record<string, string> = { host: input.host };
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");
  const canonicalPath = input.path.split("/").map(uriEncode).join("/");
  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  let key: ArrayBuffer = await hmac(enc.encode(`AWS4${input.secretAccessKey}`), day);
  for (const part of [input.region, service, "aws4_request"]) key = await hmac(key, part);
  const signature = hex(await hmac(key, stringToSign));

  return `https://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
