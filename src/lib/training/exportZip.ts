import { zipSync } from "fflate";
import type { TrainingSample } from "@/lib/storage/db";
import type { OcrTrace } from "@/lib/recognition/recognizer";

export interface TrainingLabel {
  id: string;
  createdAt: number;
  playSide: "1P" | "2P";
  /** 正解の EX スコア。数字の切り出しと分類器の学習に使う */
  exScore: number | null;
  digits: string | null;
  songId: number | null;
  title: string | null;
  level: number | null;
  difficulty: string | null;
  notes: number | null;
  /** ユーザーが確定したか。false のときは正解ラベルがなく、OCR の記録（ocr）だけがある */
  confirmed: boolean;
  autoConfirmed: boolean;
  correctedFields: string[];
  /** 画像を送らない設定のときは、画像の項目がない */
  scoreImage?: string;
  titleImage?: string;
  judgeImage?: string;
  /** パネルの中のほかの欄の切り出し（写っていて、画像を送る設定のときだけ） */
  useOptionImage?: string;
  fastSlowImage?: string;
  missCountImage?: string;
  /** 撮影した写真の全体（R2 へ送ったときだけ。zip には入れない） */
  fullImage?: string;
  /** ユーザーが確定した値（結果画面で入力・選択したもの）。分からなければ null */
  useOption: string | null;
  missCount: number | null;
  fast: number | null;
  slow: number | null;
  /** OCR が読んだ文字と確度・確定した結果（正解ラベルと突き合わせて、読み間違いを調べる） */
  ocr?: OcrTrace;
}

/** 正解ラベル。画像のパスは、zip や R2 のなかでの名前を呼び出し側が決める */
export type LabelImages = Pick<TrainingLabel, "scoreImage" | "titleImage" | "judgeImage" | "useOptionImage" | "fastSlowImage" | "missCountImage" | "fullImage">;

export function sampleLabel(s: TrainingSample, images: LabelImages): TrainingLabel {
  return {
    id: s.id,
    createdAt: s.createdAt,
    playSide: s.playSide,
    exScore: s.exScore,
    digits: s.exScore === null ? null : String(s.exScore),
    songId: s.chart?.songId ?? null,
    title: s.chart?.title ?? null,
    level: s.chart?.level ?? null,
    difficulty: s.chart?.difficulty ?? null,
    notes: s.chart?.notes ?? null,
    confirmed: s.confirmed !== false,
    autoConfirmed: s.autoConfirmed,
    correctedFields: s.correctedFields,
    useOption: s.useOption ?? null,
    missCount: s.missCount ?? null,
    fast: s.fast ?? null,
    slow: s.slow ?? null,
    ocr: s.ocr,
    ...images,
  };
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** パネルの中のほかの欄の切り出しと、そのファイル名 */
export const EXTRA_IMAGES = [
  ["useOption", "option.jpg"],
  ["fastSlow", "fastslow.jpg"],
  ["missCount", "miss.jpg"],
] as const;

/**
 * 学習サンプルを zip にまとめる。画像は枠で切り出した欄だけ（写真の全体は R2 へ送るだけで、zip には入れない）。
 * labels.json に正解ラベルを入れる。
 */
export async function buildTrainingZip(samples: readonly TrainingSample[]): Promise<{ blob: Blob; labels: TrainingLabel[] }> {
  const files: Record<string, Uint8Array> = {};
  const labels: TrainingLabel[] = [];
  for (const s of samples) {
    const scoreImage = `images/${s.id}_score.jpg`;
    const titleImage = `images/${s.id}_title.jpg`;
    files[scoreImage] = await bytes(s.scoreCrop);
    files[titleImage] = await bytes(s.titleCrop);
    const judgeImage = s.judgeCrop ? `images/${s.id}_judge.jpg` : undefined;
    if (judgeImage && s.judgeCrop) files[judgeImage] = await bytes(s.judgeCrop);
    const extra: LabelImages = {};
    for (const [k, name] of EXTRA_IMAGES) {
      const blob = s.extraCrops?.[k];
      if (!blob) continue;
      const path = `images/${s.id}_${name}`;
      files[path] = await bytes(blob);
      extra[`${k}Image`] = path;
    }
    labels.push(sampleLabel(s, { scoreImage, titleImage, judgeImage, ...extra }));
  }
  files["labels.json"] = new TextEncoder().encode(JSON.stringify(labels, null, 2));
  return { blob: new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }), labels };
}
