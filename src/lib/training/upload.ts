import type { Settings } from "@/lib/storage/settings";
import type { TrainingSample } from "@/lib/storage/db";
import { listSamples, markUploaded, needsUpload } from "@/lib/storage/samples";
import { EXTRA_IMAGES, sampleLabel, type LabelImages } from "./exportZip";

type PartName = "score" | "title" | "judge" | "labels" | "useOption" | "fastSlow" | "missCount" | "full";

interface PresignedUpload {
  name: PartName;
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

/** 1 サンプルを送る。署名付き URL を 1 回で受け取り、画像とラベルを R2 へ直接 PUT する。写真の全体を送れたら true */
export async function uploadSample(sample: TrainingSample, opts: UploadOptions): Promise<boolean> {
  try {
    return await uploadParts(sample, opts, true);
  } catch (e) {
    // 送信先の Worker が古く、パネルの中のほかの欄の切り出しや写真の全体を受け付けないときは、それを除いて送り直す
    if (e instanceof RejectedError && hasExtras(sample, opts)) return uploadParts(sample, opts, false);
    throw e;
  }
}

/** 署名付き URL の発行を断られた（送るファイルの組が受け付けられない） */
class RejectedError extends Error {}

const hasExtras = (s: TrainingSample, { includeImage = true }: UploadOptions) => includeImage && (!!s.fullImage || EXTRA_IMAGES.some(([k]) => s.extraCrops?.[k]));

async function uploadParts(sample: TrainingSample, { endpoint, deviceId, includeImage = true, fetchImpl = fetch }: UploadOptions, withExtras: boolean): Promise<boolean> {
  const extraNames: LabelImages = {};
  const parts: Partial<Record<PartName, Blob>> = {
    score: includeImage ? sample.scoreCrop : undefined,
    title: includeImage ? sample.titleCrop : undefined,
    judge: includeImage ? sample.judgeCrop : undefined,
  };
  if (includeImage && withExtras) {
    for (const [k] of EXTRA_IMAGES) {
      const blob = sample.extraCrops?.[k];
      if (!blob) continue;
      parts[k] = blob;
      // R2 では、Worker が「種類名.jpg」で保存する
      extraNames[`${k}Image`] = `${k}.jpg`;
    }
    if (sample.fullImage) parts.full = sample.fullImage;
    // 前に送り終えて端末から消したもの（確定して送り直すとき）も、R2 には残っているので名前を書く
    if (sample.fullImage || sample.fullImageUploaded) extraNames.fullImage = "full.jpg";
  }
  parts.labels = new Blob(
    [
      JSON.stringify(
        sampleLabel(sample, {
          scoreImage: includeImage ? "score.jpg" : undefined,
          titleImage: includeImage ? "title.jpg" : undefined,
          judgeImage: includeImage && sample.judgeCrop ? "judge.jpg" : undefined,
          ...extraNames,
        }),
      ),
    ],
    { type: "application/json" },
  );
  const names = (Object.keys(parts) as PartName[]).filter((n) => parts[n]);

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, id: sample.id, files: names.map((name) => ({ name, size: parts[name]!.size })) }),
  });
  if (res.status === 400) throw new RejectedError(`署名付き URL を取得できません (${res.status})`);
  if (!res.ok) throw new Error(`署名付き URL を取得できません (${res.status})`);
  const { uploads } = (await res.json()) as { uploads: PresignedUpload[] };

  for (const name of names) {
    const target = uploads.find((u) => u.name === name);
    if (!target) throw new Error(`${name} の送信先がありません`);
    // 署名したときと同じ Content-Type で送る
    const put = await fetchImpl(target.url, { method: "PUT", headers: { "Content-Type": target.contentType }, body: parts[name] });
    if (!put.ok) throw new Error(`${name} を送信できません (${put.status})`);
  }
  return parts.full !== undefined;
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
          const fullSent = await uploadSample(s, opts);
          await markUploaded(s.id, s.rev ?? 0, opts.includeImage ?? true, Date.now(), fullSent);
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
