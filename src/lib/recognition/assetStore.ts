import { ASSET_CACHE, LEGACY_CACHES } from "./assets";

/** 取得の進み具合。total は分からなければ 0 */
export interface AssetProgress {
  url: string;
  loaded: number;
  total: number;
  done: boolean;
}

/**
 * ファイルを、キャッシュにあればそこから、なければ取得してキャッシュに入れてから返す。取得の進み具合を知らせる。
 * Worker からも、ページからも使える（Cache Storage は同じオリジンで共有）
 */
export async function loadAsset(url: string, onProgress?: (p: AssetProgress) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} を取得できません（${res.status}）`);
  // 大きさが分からない（圧縮して送られた）ときは 0。圧縮されていると、content-length（圧縮後）より多く読むので、そのときも 0 とする
  const encoded = (res.headers.get("content-encoding") ?? "identity") !== "identity";
  const total = encoded ? 0 : Number(res.headers.get("content-length")) || 0;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ url, loaded, total, done: false });
  if (res.body) {
    const reader = res.body.getReader();
    let last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      // 知らせるのは、ほどほどの間隔で（1MB ごと）
      if (loaded - last >= 1 << 20) {
        last = loaded;
        onProgress?.({ url, loaded, total: total && Math.max(total, loaded), done: false });
      }
    }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer());
    chunks.push(buf);
    loaded = buf.byteLength;
  }
  const body = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }
  await cache.put(url, new Response(body, { headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream", "content-length": String(loaded) } }));
  onProgress?.({ url, loaded, total: loaded, done: true });
  return body.buffer;
}

/** キャッシュにあるファイル。legacy は以前の版のキャッシュのもの */
export interface CachedAsset {
  url: string;
  bytes: number;
  legacy: boolean;
}

async function entries(name: string, legacy: boolean): Promise<CachedAsset[]> {
  if (!(await caches.has(name))) return [];
  const cache = await caches.open(name);
  const out: CachedAsset[] = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const header = Number(res?.headers.get("content-length"));
    // 大きさが分からなければ、中身を読んで測る（以前の版のキャッシュ）
    const bytes = header > 0 ? header : ((await res?.clone().arrayBuffer())?.byteLength ?? 0);
    out.push({ url: req.url, bytes, legacy });
  }
  return out;
}

export async function listCachedAssets(): Promise<CachedAsset[]> {
  if (typeof caches === "undefined") return [];
  const lists = await Promise.all([entries(ASSET_CACHE, false), ...LEGACY_CACHES.map((n) => entries(n, true))]);
  return lists.flat();
}

/** ファイルを削除する。以前の版のキャッシュは、空になったらキャッシュごと消す */
export async function deleteCachedAssets(assets: readonly CachedAsset[]): Promise<void> {
  for (const a of assets) for (const n of a.legacy ? LEGACY_CACHES : [ASSET_CACHE]) await (await caches.open(n)).delete(a.url);
  for (const n of LEGACY_CACHES) {
    if ((await caches.has(n)) && (await (await caches.open(n)).keys()).length === 0) await caches.delete(n);
  }
}
