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
