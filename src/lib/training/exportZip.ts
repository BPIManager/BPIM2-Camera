import { zipSync } from "fflate";
import type { TrainingSample } from "@/lib/storage/db";

export interface TrainingLabel {
  id: string;
  createdAt: number;
  playSide: "1P" | "2P";
  /** 正解の EX スコア。数字の切り出しと分類器の学習に使う */
  exScore: number;
  digits: string;
  songId: number;
  title: string;
  level: number;
  difficulty: string;
  notes: number;
  autoConfirmed: boolean;
  correctedFields: string[];
  scoreImage: string;
  titleImage: string;
  judgeImage?: string;
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
    labels.push({
      id: s.id,
      createdAt: s.createdAt,
      playSide: s.playSide,
      exScore: s.exScore,
      digits: String(s.exScore),
      songId: s.chart.songId,
      title: s.chart.title,
      level: s.chart.level,
      difficulty: s.chart.difficulty,
      notes: s.chart.notes,
      autoConfirmed: s.autoConfirmed,
      correctedFields: s.correctedFields,
      scoreImage,
      titleImage,
      judgeImage,
    });
  }
  files["labels.json"] = new TextEncoder().encode(JSON.stringify(labels, null, 2));
  return { blob: new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }), labels };
}
