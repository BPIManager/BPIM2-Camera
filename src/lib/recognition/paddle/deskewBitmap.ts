import { toGray } from "@/lib/vision/frame";
import { estimateTilt } from "@/lib/vision/deskew";

/** これ未満の傾きは、補正しても得がないので回さない（度） */
export const MIN_TILT = 1.5;
/** 傾きの推定に使う幅。縮小して軽くする */
const PROBE_WIDTH = 320;

/** 枠の中の文字の行の傾きを推定する（度。正は時計回り）。OCR は使わず、縮小した画像の濃淡から求めるので軽い */
export function estimateBitmapTilt(bitmap: ImageBitmap): number {
  const ph = Math.max(1, Math.round((bitmap.height * PROBE_WIDTH) / bitmap.width));
  const probe = new OffscreenCanvas(PROBE_WIDTH, ph);
  const pctx = probe.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(bitmap, 0, 0, PROBE_WIDTH, ph);
  return estimateTilt(toGray(pctx.getImageData(0, 0, PROBE_WIDTH, ph).data, PROBE_WIDTH, ph)).angle;
}

/**
 * 画像を、傾き angle（度）を打ち消す向きに回す。回すと四隅が欠けるので、黒で埋めて、画像を広げる。
 * 傾きが小さい（MIN_TILT 未満）ときは null（回さない）
 */
export async function rotateBitmap(bitmap: ImageBitmap, angle: number): Promise<{ bitmap: ImageBitmap; angle: number } | null> {
  if (!Number.isFinite(angle) || Math.abs(angle) < MIN_TILT) return null;
  const rad = (angle * Math.PI) / 180;
  const w = Math.ceil(Math.abs(bitmap.width * Math.cos(rad)) + Math.abs(bitmap.height * Math.sin(rad)));
  const h = Math.ceil(Math.abs(bitmap.width * Math.sin(rad)) + Math.abs(bitmap.height * Math.cos(rad)));
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad); // 正の角度は時計回り
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return { bitmap: await createImageBitmap(c), angle };
}

/** 切り出した枠の、文字の行の傾きを推定して、水平になるよう回した画像を返す。傾きが小さいときは null（回さない） */
export async function deskewBitmap(bitmap: ImageBitmap): Promise<{ bitmap: ImageBitmap; angle: number } | null> {
  return rotateBitmap(bitmap, estimateBitmapTilt(bitmap));
}
