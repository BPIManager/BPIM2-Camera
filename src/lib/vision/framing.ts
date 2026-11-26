export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** ガイド枠の縦横比（曲名とスコアが入る範囲） */
export const GUIDE_ASPECT = 3 / 2;
const MARGIN = 16;
const MAX_WIDTH = 720;

/** 表示領域の中央に置くガイド枠。表示と切り出しで同じ値を使う */
export function computeGuideRect(view: Size): Rect {
  const maxW = Math.min(view.width - MARGIN * 2, MAX_WIDTH);
  const maxH = view.height - MARGIN * 2;
  const width = Math.max(0, Math.min(maxW, maxH * GUIDE_ASPECT));
  const height = width / GUIDE_ASPECT;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

/**
 * `object-fit: cover` で表示した映像上の枠を、映像のピクセル座標に直す。
 * 映像の外にはみ出さないよう丸める。
 */
export function guideToVideoRect(guide: Rect, view: Size, video: Size): Rect {
  const scale = Math.max(view.width / video.width, view.height / video.height);
  const offsetX = (video.width * scale - view.width) / 2;
  const offsetY = (video.height * scale - view.height) / 2;
  const x = Math.max(0, Math.round((guide.x + offsetX) / scale));
  const y = Math.max(0, Math.round((guide.y + offsetY) / scale));
  const right = Math.min(video.width, Math.round((guide.x + guide.width + offsetX) / scale));
  const bottom = Math.min(video.height, Math.round((guide.y + guide.height + offsetY) / scale));
  return { x, y, width: right - x, height: bottom - y };
}
