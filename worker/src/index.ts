import { presignUrl } from "./presign";

/** Worker のシークレット・変数。S3 の鍵はクライアントへ渡さない */
export interface Env {
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  /** 許可するオリジン（カンマ区切り）。未設定なら CORS を許可しない */
  ALLOWED_ORIGINS?: string;
}

/** 1 サンプルで送れるファイル。拡張子と Content-Type を固定し、それ以外は受けない */
export const FILE_KINDS = {
  score: { ext: "jpg", type: "image/jpeg" },
  title: { ext: "jpg", type: "image/jpeg" },
  judge: { ext: "jpg", type: "image/jpeg" },
  // パネルの中のほかの欄（使用オプション・FAST/SLOW・ミスカウント）の切り出し。読み取りの学習に使う
  useOption: { ext: "jpg", type: "image/jpeg" },
  fastSlow: { ext: "jpg", type: "image/jpeg" },
  missCount: { ext: "jpg", type: "image/jpeg" },
  labels: { ext: "json", type: "application/json" },
} as const;
type Kind = keyof typeof FILE_KINDS;

export const MAX_IMAGE_BYTES = 512 * 1024;
export const MAX_LABELS_BYTES = 16 * 1024;
export const URL_TTL_SECONDS = 600;

const ID = /^[A-Za-z0-9_-]{8,64}$/;

interface Body {
  deviceId: string;
  id: string;
  files: { name: Kind; size: number }[];
}

function parse(raw: unknown): Body | string {
  if (typeof raw !== "object" || raw === null) return "本文が不正です";
  const b = raw as Record<string, unknown>;
  if (typeof b.deviceId !== "string" || !ID.test(b.deviceId)) return "deviceId が不正です";
  if (typeof b.id !== "string" || !ID.test(b.id)) return "id が不正です";
  if (!Array.isArray(b.files) || b.files.length === 0 || b.files.length > 7) return "files が不正です";
  const seen = new Set<string>();
  const files: Body["files"] = [];
  for (const f of b.files as Record<string, unknown>[]) {
    const name = f?.name;
    if (typeof name !== "string" || !(name in FILE_KINDS) || seen.has(name)) return "ファイル名が不正です";
    seen.add(name);
    const limit = name === "labels" ? MAX_LABELS_BYTES : MAX_IMAGE_BYTES;
    if (typeof f.size !== "number" || !Number.isInteger(f.size) || f.size <= 0 || f.size > limit) return `${name} のサイズが不正です`;
    files.push({ name: name as Kind, size: f.size });
  }
  // 画像は任意（画像を含めない設定のときは labels だけが届く）。ただし画像を送るなら score・title はそろえる
  if (!seen.has("labels")) return "labels は必須です";
  if (seen.has("score") !== seen.has("title")) return "score と title は、そろえて送ってください";
  return { deviceId: b.deviceId, id: b.id, files };
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

const json = (data: unknown, status: number, extra: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

/** 署名付き URL を発行する。画像と labels は、クライアントが R2 へ直接 PUT する */
export async function handle(req: Request, env: Env, now = new Date()): Promise<Response> {
  const headers = cors(req, env);
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (url.pathname !== "/v1/upload-urls") return json({ error: "not found" }, 404, headers);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, headers);
  // 本文は小さい JSON のみ
  if (Number(req.headers.get("Content-Length") ?? 0) > 4096) return json({ error: "too large" }, 413, headers);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "JSON が不正です" }, 400, headers);
  }
  const body = parse(raw);
  if (typeof body === "string") return json({ error: body }, 400, headers);

  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const uploads = await Promise.all(
    body.files.map(async ({ name }) => {
      const kind = FILE_KINDS[name];
      const key = `samples/${body.deviceId}/${body.id}/${name}.${kind.ext}`;
      const signed = await presignUrl({
        method: "PUT",
        host,
        path: `/${env.R2_BUCKET}/${key}`,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        region: "auto",
        headers: { "content-type": kind.type },
        expiresIn: URL_TTL_SECONDS,
        now,
      });
      return { name, url: signed, contentType: kind.type };
    }),
  );
  return json({ uploads, expiresIn: URL_TTL_SECONDS }, 200, headers);
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
