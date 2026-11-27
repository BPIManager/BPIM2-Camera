import type { OcrEngine } from "@/lib/recognition/paddle/engine";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { findAnchors, fitFrames, type FrameFit } from "./autoFrame";
import { CANONICAL_LAYOUT } from "./autoFrameCanon";
import { GUIDE_KEYS, type GuideKey, type GuideLayout } from "./guides";

/** 枠の自動推定で画像全体を読むときの長辺（画素）。大きいほど小さい文字を拾えるが、遅い */
const SCAN_SIDE = 1280;

/**
 * 取り込んだ画像の全体を 1 回 OCR して、撮影枠（スコア・曲名・判定）の位置を推定する。推定できなければ null
 */
export async function detectFrames(image: ImageBitmap, engine: OcrEngine, master: readonly SongMasterEntry[]): Promise<FrameFit | null> {
  const scale = Math.min(1, SCAN_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const lines = await engine.readLines(ctx.getImageData(0, 0, width, height));
  // 曲名の行も手がかりにする（曲データの曲名と照らし合わせて見つける）
  const titleScore = (text: string) => matchChart(master, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: text }).candidates[0]?.score ?? 0;
  return fitFrames(findAnchors(lines, { width, height }, titleScore), CANONICAL_LAYOUT, { width, height }, 2);
}

/** 画像から、枠（画像に対する割合）の中を切り出す。撮影したときの切り出しと同じく JPEG にする */
export async function cropRegions(image: ImageBitmap, layout: GuideLayout): Promise<Record<GuideKey, Blob>> {
  const entries = await Promise.all(
    GUIDE_KEYS.map(async (k) => {
      const r = layout[k];
      const x = Math.max(0, Math.round(r.x * image.width));
      const y = Math.max(0, Math.round(r.y * image.height));
      const w = Math.max(1, Math.min(image.width - x, Math.round(r.width * image.width)));
      const h = Math.max(1, Math.min(image.height - y, Math.round(r.height * image.height)));
      const c = new OffscreenCanvas(w, h);
      c.getContext("2d")!.drawImage(image, x, y, w, h, 0, 0, w, h);
      return [k, await c.convertToBlob({ type: "image/jpeg", quality: 0.92 })] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<GuideKey, Blob>;
}
