import type { Settings } from "@/lib/storage/settings";
import type { TrainingSample } from "@/lib/storage/db";
import { listSamples, markUploaded, needsUpload } from "@/lib/storage/samples";
import { sampleLabel } from "./exportZip";

interface PresignedUpload {
  name: "score" | "title" | "judge" | "labels";
  url: string;
  contentType: string;
}

export interface UploadOptions {
  /** 署名付き URL を発行する Worker のエンドポイント（`/v1/upload-urls` までを含む） */
  endpoint: string;
  deviceId: string;
  /** 画像（スコア部・曲名帯・判定表）も送るか。false なら labels.json だけ送る */
  includeImage?: boolean;
  fetchImpl?: typeof fetch;
}

export interface FlushResult {
  uploaded: number;
  /** 送れず、次の機会に回したもの */
  failed: number;
}

/** 送信先。ビルド時の環境変数。空なら送信しない */
export const uploadEndpoint = (): string => import.meta.env.VITE_STATS_UPLOAD_ENDPOINT ?? "";

/** 送信してよい設定か。同意があるとき（画像を含めない設定なら、labels.json だけ送る） */
export const canUpload = (s: Pick<Settings, "statsConsent">): boolean => s.statsConsent === true;

/** 1 サンプルを送る。署名付き URL を 1 回で受け取り、画像とラベルを R2 へ直接 PUT する */
export async function uploadSample(sample: TrainingSample, { endpoint, deviceId, includeImage = true, fetchImpl = fetch }: UploadOptions): Promise<void> {
  const labels = new Blob(
    [
      JSON.stringify(
        sampleLabel(sample, {
          scoreImage: includeImage ? "score.jpg" : undefined,
          titleImage: includeImage ? "title.jpg" : undefined,
          judgeImage: includeImage && sample.judgeCrop ? "judge.jpg" : undefined,
        }),
      ),
    ],
    { type: "application/json" },
  );
  const parts: Record<PresignedUpload["name"], Blob | undefined> = {
    score: includeImage ? sample.scoreCrop : undefined,
    title: includeImage ? sample.titleCrop : undefined,
    judge: includeImage ? sample.judgeCrop : undefined,
    labels,
  };
  const names = (Object.keys(parts) as PresignedUpload["name"][]).filter((n) => parts[n]);

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, id: sample.id, files: names.map((name) => ({ name, size: parts[name]!.size })) }),
  });
  if (!res.ok) throw new Error(`署名付き URL を取得できません (${res.status})`);
  const { uploads } = (await res.json()) as { uploads: PresignedUpload[] };

  for (const name of names) {
    const target = uploads.find((u) => u.name === name);
    if (!target) throw new Error(`${name} の送信先がありません`);
    // 署名したときと同じ Content-Type で送る
    const put = await fetchImpl(target.url, { method: "PUT", headers: { "Content-Type": target.contentType }, body: parts[name] });
    if (!put.ok) throw new Error(`${name} を送信できません (${put.status})`);
  }
}

let inFlight: Promise<FlushResult> | null = null;

/** 未送信のサンプルを古い順に送る。同時に 1 つだけ動く。失敗したものは残し、次の機会にやり直す */
export function flushSamples(opts: UploadOptions): Promise<FlushResult> {
  // 送っている最中に増えた・変わったサンプルを取りこぼさないよう、終わってからもう一度走らせる
  if (inFlight) return inFlight.then(() => flushSamples(opts));
  inFlight = (async () => {
    const result: FlushResult = { uploaded: 0, failed: 0 };
    try {
      for (const s of await listSamples()) {
        if (!needsUpload(s, opts.includeImage ?? true)) continue;
        try {
          await uploadSample(s, opts);
          await markUploaded(s.id, s.rev ?? 0, opts.includeImage ?? true);
          result.uploaded++;
        } catch {
          result.failed++;
          // 通信できないときは、残りも失敗するので打ち切る
          if (typeof navigator !== "undefined" && navigator.onLine === false) break;
        }
      }
    } finally {
      inFlight = null;
    }
    return result;
  })();
  return inFlight;
}

/** 設定と送信先がそろっているときだけ、未送信分を送る。撮影の流れを止めないよう、呼び出し側は待たない */
export function flushIfEnabled(settings: Pick<Settings, "statsConsent" | "statsIncludeImage" | "deviceId">): Promise<FlushResult> | null {
  const endpoint = uploadEndpoint();
  if (!endpoint || !canUpload(settings)) return null;
  return flushSamples({ endpoint, deviceId: settings.deviceId, includeImage: settings.statsIncludeImage });
}
