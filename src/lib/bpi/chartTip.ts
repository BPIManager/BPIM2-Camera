/** BPI チャートの棒 1 本。BPI の目盛りの棒・今回（YOU）・自己歴代（BEST のゴースト） */
export interface TipBar {
  label: string;
  score: number;
  you: boolean;
  ghost?: boolean;
}

/** ツールチップの 1 行。tone は、今回より高い（あと何点）が up、今回が上回っているが down、それ以外は muted */
export interface TipLine {
  text: string;
  tone: "up" | "down" | "muted";
}

export interface Tip {
  title: string;
  lines: TipLine[];
}

const n = (v: number) => v.toLocaleString("ja-JP");

/** 今回のスコアとの差の説明。棒のほうが高ければ「あと」、今回が上回っていれば「上回る」 */
function against(diff: number, what: string): TipLine {
  if (diff > 0) return { text: `${what}まで あと ${n(diff)}`, tone: "up" };
  if (diff < 0) return { text: `${what}を ${n(-diff)} 上回る`, tone: "down" };
  return { text: `${what}と同点`, tone: "muted" };
}

/**
 * 棒を押したとき（マウスを乗せたとき）に出す内容（BPIM2 の曲詳細のチャートと同じ考え方）。
 * BPI の棒は必要なスコアと今回との差、YOU は今回のスコア、BEST は自己歴代のスコア・バージョン・今回との差
 */
export function tipFor(bar: TipBar, exScore: number, bestVersion: string | null): Tip {
  if (bar.you) return { title: "YOU（今回）", lines: [{ text: `スコア ${n(bar.score)}`, tone: "muted" }] };
  const diff = bar.score - exScore;
  if (bar.ghost) {
    return {
      title: `自己歴代${bestVersion ? `（${bestVersion}）` : ""}`,
      lines: [{ text: `スコア ${n(bar.score)}`, tone: "muted" }, against(diff, "自己歴代")],
    };
  }
  return { title: `BPI ${bar.label}`, lines: [{ text: `必要スコア ${n(bar.score)}`, tone: "muted" }, against(diff, `BPI ${bar.label}`)] };
}

/**
 * 指（マウス）の横の位置から、その下の棒の番号を求める。左右に余白（padX）があり、棒は同じ幅の枠に並ぶ。
 * 余白や端の外は、いちばん近い棒にする（指が少しはみ出しても、ツールチップが途切れない）
 */
export function barIndexAt(clientX: number, box: { left: number; width: number }, count: number, padX: number): number {
  if (count <= 0) return -1;
  const slot = (box.width - padX * 2) / count;
  return Math.min(Math.max(Math.floor((clientX - box.left - padX) / slot), 0), count - 1);
}
