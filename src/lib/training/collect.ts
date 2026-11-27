import type { Settings } from "@/lib/storage/settings";
import { saveSample } from "@/lib/storage/samples";
import type { Draft } from "@/features/result/draft";
import { inferSide, resolveLayout } from "@/lib/vision/guides";

/**
 * 読み取りが終わった時点（成功・失敗を問わず）で、学習サンプルを貯める。ユーザーの確定は待たない。
 * 正解ラベルはまだないので、画像と OCR の記録だけを入れる（確定したら confirmSample で正解を足して送り直す）。
 * 統計への同意があり、枠で切り出した画像があるとき（カメラ撮影）だけ貯める。貯めたら true
 */
export async function collectReadSample(draft: Draft, settings: Pick<Settings, "statsConsent" | "layout">): Promise<boolean> {
  if (settings.statsConsent !== true || !draft.regions) return false;
  await saveSample({
    id: draft.id,
    createdAt: Date.now(),
    playSide: inferSide(resolveLayout(settings.layout)),
    chart: null,
    exScore: null,
    confirmed: false,
    rev: 0,
    autoConfirmed: false,
    correctedFields: [],
    scoreCrop: draft.regions.score,
    titleCrop: draft.regions.title,
    judgeCrop: draft.regions.judge,
    extraCrops: draft.extraCrops,
    ocr: draft.ocr,
  });
  return true;
}
