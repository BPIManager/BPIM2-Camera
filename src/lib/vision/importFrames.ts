import type { OcrEngine } from "@/lib/recognition/paddle/engine";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { findAnchors, fitFrames, type FrameFit } from "./autoFrame";
import { CANONICAL_LAYOUT, CANONICAL_LAYOUT_2P } from "./autoFrameCanon";
import { GUIDE_KEYS, type GuideKey, type GuideLayout } from "./guides";

/** 枠の自動推定で画像全体を読むときの長辺（画素）。大きいほど小さい文字を拾えるが、遅い */
const SCAN_SIDE = 1280;

/**
 * 取り込んだ画像の全体を 1 回 OCR して、撮影枠（スコア・曲名・判定）の位置を推定する。推定できなければ null
 */
export async function detectFrames(image: ImageBitmap, engine: OcrEngine, master: readonly SongMasterEntry[], side: "1P" | "2P" | "auto" = "auto"): Promise<(FrameFit & { side: "1P" | "2P" }) | null> {
  const scale = Math.min(1, SCAN_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const lines = await engine.readLines(ctx.getImageData(0, 0, width, height));
  // 曲名の行も手がかりにする（曲データの曲名と照らし合わせて見つける）
  const titleScore = (text: string) => matchChart(master, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: text }).candidates[0]?.score ?? 0;
  const anchors = findAnchors(lines, { width, height }, titleScore);
  // 1P・2P の基準で当てはめる。パネルの手がかりはどちらでも合い、曲名まわりの手がかりは合うほうでだけ使われるので、使えた手がかりの多いほうを採る。
  // 同じなら（曲名まわりが読めなかったなど）1P。プレーサイドを設定で決めていれば、その側だけ
  const fits = (side === "auto" ? (["1P", "2P"] as const) : [side]).map((s) => {
    const fit = fitFrames(anchors, s === "1P" ? CANONICAL_LAYOUT : CANONICAL_LAYOUT_2P, { width, height }, 2);
    return fit ? { ...fit, side: s } : null;
  });
  return fits.reduce<(FrameFit & { side: "1P" | "2P" }) | null>((best, f) => (f && (!best || f.used > best.used) ? f : best), null);
}

/** 枠（画像に対する割合）を、画像の画素の位置にする */
export function layoutToPixels(layout: GuideLayout, size: { width: number; height: number }): Record<GuideKey, { x: number; y: number; width: number; height: number }> {
  return Object.fromEntries(
    GUIDE_KEYS.map((k) => {
      const r = layout[k];
      const x = Math.max(0, Math.round(r.x * size.width));
      const y = Math.max(0, Math.round(r.y * size.height));
      return [k, { x, y, width: Math.max(1, Math.min(size.width - x, Math.round(r.width * size.width))), height: Math.max(1, Math.min(size.height - y, Math.round(r.height * size.height))) }];
    }),
  ) as Record<GuideKey, { x: number; y: number; width: number; height: number }>;
}

/** 画像から、枠（画像に対する割合）の中を切り出す。撮影したときの切り出しと同じく JPEG にする */
export async function cropRegions(image: ImageBitmap, layout: GuideLayout): Promise<Record<GuideKey, Blob>> {
  const px = layoutToPixels(layout, image);
  const entries = await Promise.all(
    GUIDE_KEYS.map(async (k) => {
      const { x, y, width: w, height: h } = px[k];
      const c = new OffscreenCanvas(w, h);
      c.getContext("2d")!.drawImage(image, x, y, w, h, 0, 0, w, h);
      return [k, await c.convertToBlob({ type: "image/jpeg", quality: 0.92 })] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<GuideKey, Blob>;
}
