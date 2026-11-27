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
  scoreImage: string;
  titleImage: string;
  judgeImage?: string;
  /** OCR が読んだ文字と確度・確定した結果（正解ラベルと突き合わせて、読み間違いを調べる） */
  ocr?: OcrTrace;
}

/** 正解ラベル。画像のパスは、zip や R2 のなかでの名前を呼び出し側が決める */
export function sampleLabel(s: TrainingSample, images: { scoreImage: string; titleImage: string; judgeImage?: string }): TrainingLabel {
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
    ocr: s.ocr,
    ...images,
  };
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/**
 * 学習サンプルを zip にまとめる。画像は枠で切り出したスコア部・曲名帯・判定表だけ（全体画像や位置情報は含めない）。
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
    labels.push(sampleLabel(s, { scoreImage, titleImage, judgeImage }));
  }
  files["labels.json"] = new TextEncoder().encode(JSON.stringify(labels, null, 2));
  return { blob: new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }), labels };
}
