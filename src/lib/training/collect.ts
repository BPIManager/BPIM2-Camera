import type { Settings } from "@/lib/storage/settings";
import { saveSample } from "@/lib/storage/samples";
import type { Draft } from "@/features/result/draft";
import { resolvePlaySide } from "@/lib/storage/settings";
import { encodeFullImage } from "./fullImage";

/**
 * 読み取りが終わった時点（成功・失敗を問わず）で、学習サンプルを貯める。ユーザーの確定は待たない。
 * 正解ラベルはまだないので、画像と OCR の記録だけを入れる（確定したら confirmSample で正解を足して送り直す）。
 * 統計への同意があり、枠で切り出した画像があるとき（カメラ撮影）だけ貯める。貯めたら true
 */
export async function collectReadSample(draft: Draft, settings: Pick<Settings, "statsConsent" | "layout" | "playSide">): Promise<boolean> {
  if (settings.statsConsent !== true || !draft.regions) return false;
  // 撮影した写真の全体（FAST/SLOW など、切り出しの位置がまだ定まらない欄の学習に使う）。作れなくても切り出しは貯める
  const fullImage = await encodeFullImage(draft.image).catch(() => null);
  await saveSample({
    id: draft.id,
    createdAt: Date.now(),
    playSide: resolvePlaySide(settings),
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
    fullImage: fullImage ?? undefined,
    ocr: draft.ocr,
  });
  return true;
}
