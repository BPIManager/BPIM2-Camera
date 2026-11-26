export type ShareOutcome = "shared" | "intent" | "cancelled";

export function buildIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/**
 * Web Share API で画像と本文を渡す。使えないときは本文だけ intent で渡し、
 * 画像は呼び出し側で保存してもらう。本文はクリップボードにも入れる（本文が落ちる端末対策）。
 */
export async function shareResult(text: string, image: Blob | null): Promise<ShareOutcome> {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
  const file = image ? new File([image], "iidx-result.jpg", { type: image.type || "image/jpeg" }) : null;
  const data: ShareData = file ? { text, files: [file] } : { text };
  if (navigator.share && (!file || navigator.canShare?.(data))) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  window.open(buildIntentUrl(text), "_blank", "noopener");
  return "intent";
}
