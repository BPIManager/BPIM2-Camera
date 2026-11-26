/** 全角英数→半角、記号・空白除去、小文字化。曲名 OCR との照合用 */
export function normalizeTitle(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　"'’‘“”`.,:;!?·・\-_~〜~/\\()[\]{}<>*]/g, "");
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0〜1。1 が完全一致 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  const max = Math.max(na.length, nb.length);
  if (max === 0) return 0;
  return 1 - editDistance(na, nb) / max;
}
