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
 * zoom は、映像を中央から拡大して見せているとき（デジタルズーム）の倍率。カメラ自体のズームは映像に反映済みなので、1 のまま。
 */
export function guideToVideoRect(guide: Rect, view: Size, video: Size, zoom = 1): Rect {
  const scale = Math.max(view.width / video.width, view.height / video.height) * zoom;
  const offsetX = (video.width * scale - view.width) / 2;
  const offsetY = (video.height * scale - view.height) / 2;
  const x = Math.max(0, Math.round((guide.x + offsetX) / scale));
  const y = Math.max(0, Math.round((guide.y + offsetY) / scale));
  const right = Math.min(video.width, Math.round((guide.x + guide.width + offsetX) / scale));
  const bottom = Math.min(video.height, Math.round((guide.y + guide.height + offsetY) / scale));
  return { x, y, width: right - x, height: bottom - y };
}
