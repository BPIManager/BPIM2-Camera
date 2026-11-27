import { ASSET_CACHE, RUNTIME_URL, resolveModelFiles } from "./assets";
import { loadAsset } from "./assetStore";

/** 取得するものの 1 項目（画面に、名前と大きさを出す） */
export interface PrefetchItem {
  label: string;
  urls: string[];
  /** まだ取得していない分の大きさ（バイト。分からなければ目安） */
  bytes: number;
  /** すべて取得済み */
  cached: boolean;
}

/** 大きさが分からない（圧縮して送られる）ときの目安。ファイル名で引く */
const APPROX_BYTES: Record<string, number> = {
  "PP-OCRv6_small_det.onnx": 9_880_512,
  "PP-OCRv6_small_rec.onnx": 21_159_378,
  "ppocrv6_dict.txt": 74_948,
};
const APPROX_RUNTIME = { cpu: 14_848_852, gpu: 28_747_738 };
const fileName = (url: string) => url.split("?")[0]!.split("/").pop()!;

async function sizeOf(url: string, approx: number): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const encoded = (res.headers.get("content-encoding") ?? "identity") !== "identity";
    const n = Number(res.headers.get("content-length"));
    if (res.ok && !encoded && n > 0) return n;
  } catch {
    /* 目安を使う */
  }
  return approx;
}

/** ベンチマークに要るもの（読み取りのモデルと、CPU 用・GPU 用のランタイム）と、その大きさ。取得済みのものは 0 */
export async function planBenchmarkDownloads(gpu: boolean): Promise<PrefetchItem[]> {
  const cache = await caches.open(ASSET_CACHE);
  const models = await resolveModelFiles("small");
  const groups: { label: string; urls: string[]; approx: (url: string) => number }[] = [
    { label: "読み取りのモデル", urls: [models.detection, models.recognition, models.charactersDictionary], approx: (u) => APPROX_BYTES[fileName(u)] ?? 0 },
    { label: "CPU 用のランタイム", urls: [RUNTIME_URL.cpu], approx: () => APPROX_RUNTIME.cpu },
  ];
  // 開発サーバーでは、CPU 用と GPU 用が同じファイル
  if (gpu && RUNTIME_URL.gpu !== RUNTIME_URL.cpu) groups.push({ label: "GPU 用のランタイム", urls: [RUNTIME_URL.gpu], approx: () => APPROX_RUNTIME.gpu });
  return Promise.all(
    groups.map(async (g) => {
      const missing = (await Promise.all(g.urls.map(async (u) => ((await cache.match(u)) ? null : u)))).filter((u): u is string => u !== null);
      const sizes = await Promise.all(missing.map((u) => sizeOf(u, g.approx(u))));
      return { label: g.label, urls: g.urls, bytes: sizes.reduce((a, b) => a + b, 0), cached: missing.length === 0 };
    }),
  );
}

/** まとめて取得する（取得済みのものは、キャッシュから読むだけ）。進み具合は、取得した量と全体の大きさ（目安） */
export async function prefetch(items: readonly PrefetchItem[], onProgress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  const total = items.reduce((a, it) => a + it.bytes, 0);
  const loaded = new Map<string, number>();
  const report = () => onProgress(Math.min(total, [...loaded.values()].reduce((a, b) => a + b, 0)), total);
  report();
  // 1 つずつ取得する（回線が細いときに、全部が少しずつ進むより、1 つずつ終わるほうが分かりやすい）
  for (const url of items.filter((it) => !it.cached).flatMap((it) => it.urls)) {
    signal?.throwIfAborted();
    await loadAsset(
      url,
      (p) => {
        loaded.set(url, p.loaded);
        report();
      },
      signal,
    );
  }
  onProgress(total, total);
}
