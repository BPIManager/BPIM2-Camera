/** 全体の写真の長い辺の上限（画素）。FAST/SLOW の数字が読める解像度を残す */
const MAX_SIDE = 1920;
/** Worker の上限（2MB）より少し小さく */
const MAX_BYTES = 1.8 * 1024 * 1024;

/**
 * 撮影した写真の全体を、学習サンプル用の JPEG にする。
 * 必ず描き直すので、取り込んだ写真の EXIF（撮影場所など）は残らない。大きければ縮め、上限を超えれば画質を下げる。作れなければ null
 */
export async function encodeFullImage(image: Blob): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return null;
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const c = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await c.convertToBlob({ type: "image/jpeg", quality });
      if (blob.size <= MAX_BYTES) return blob;
    }
    return null;
  } finally {
    bitmap.close();
  }
}
