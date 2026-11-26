const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/**
 * Android 等はダウンロードで保存。iOS は共有シートの「画像を保存」に回す（自動保存はできない）。
 * @returns 画像を保存フローに渡せたら true
 */
export async function saveImage(blob: Blob, name: string): Promise<boolean> {
  if (isIos() && navigator.share) {
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch {
        return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
