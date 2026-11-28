import { apply, fitSimilarity } from "./autoFrame";
import type { Rect } from "./framing";
import type { GuideKey } from "./guides";

/**
 * リザルト画面の左のパネル（2P では右のパネル）の中で、撮影枠のほかに読みたい欄の位置を、スコア欄・判定表の枠から求める。
 * パネルの中の並びは 1P・2P で同じ（2P ではパネルがまとまりのまま右へ動くだけ）なので、同じ式で求まる。
 * 曲名の枠は 2P で離れた場所へ動くので使わない。
 *
 * 基準は、実機で撮った写真（1080×1920）での位置（画素）。撮影枠は、撮影時の切り出しを全体画像から探したもの
 */
const REF_FRAMES: Record<"score" | "judge", Rect> = {
  score: { x: 297, y: 804, width: 205, height: 65 },
  judge: { x: 354, y: 995, width: 162, height: 123 },
};

/** 読みたい欄 */
export type PanelRegion = "useOption" | "fastSlow" | "missCount" | "clearType" | "clearTypeWide";

const REF_REGIONS: Record<PanelRegion, Rect> = {
  // USE OPTION の見出しと値（DJ LEVEL のグラフの枠の下）
  // 枠の置き方で縦にずれやすいので、上（DJ LEVEL のグラフの枠）から下（ベストスコアの見出し）まで広く取る。オプション名だけを探すので、ほかの行が入ってもよい
  useOption: { x: 0, y: 540, width: 340, height: 190 },
  // TIMING STATUS（FAST・SLOW の数）。ずれに備えて少し広く
  fastSlow: { x: 50, y: 1095, width: 300, height: 110 },
  // MISS COUNT の行の、今回の値のあたり（スコア欄の 1 行下）。ずれに備えて少し広く
  missCount: { x: 280, y: 830, width: 250, height: 100 },
  // CLEAR TYPE の行（スコア欄の 2 行上）。左がベスト、右が今回のランプ。見出し（CLEAR TYPE）の右から、ずれに備えて上下に広く
  clearType: { x: 150, y: 670, width: 380, height: 100 },
  // 上で読めなかったときの読み直し用。少し下へ広げる（行が切り出しの下の端にかかる写真のため）。
  // 写真 89 枚で、上だけなら 86 枚、こちらだけなら 87 枚、両方で 89 枚の今回のランプが読め、誤りはなかった
  clearTypeWide: { x: 150, y: 680, width: 380, height: 120 },
};

const corners = (r: Rect) => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x, y: r.y + r.height },
  { x: r.x + r.width, y: r.y + r.height },
];

/**
 * 撮影枠（全体画像での画素）から、読みたい欄の位置（全体画像での画素）を求める。画像の外に出る部分は切り詰め、ほとんど残らなければ null
 */
export function panelRegions(frames: Pick<Record<GuideKey, Rect>, "score" | "judge">, size: { width: number; height: number }): Record<PanelRegion, Rect | null> {
  const m = fitSimilarity([...corners(REF_FRAMES.score), ...corners(REF_FRAMES.judge)], [...corners(frames.score), ...corners(frames.judge)]);
  const place = (r: Rect): Rect | null => {
    const cs = corners(r).map((p) => apply(m, p));
    const x0 = Math.max(0, Math.min(...cs.map((c) => c.x)));
    const y0 = Math.max(0, Math.min(...cs.map((c) => c.y)));
    const x1 = Math.min(size.width, Math.max(...cs.map((c) => c.x)));
    const y1 = Math.min(size.height, Math.max(...cs.map((c) => c.y)));
    // 半分以上が画像の外なら、写っていないものとする
    const full = (r.width * m.s) * (r.height * m.s);
    if (x1 - x0 < 4 || y1 - y0 < 4 || (x1 - x0) * (y1 - y0) < full * 0.5) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  return { useOption: place(REF_REGIONS.useOption), fastSlow: place(REF_REGIONS.fastSlow), missCount: place(REF_REGIONS.missCount), clearType: place(REF_REGIONS.clearType), clearTypeWide: place(REF_REGIONS.clearTypeWide) };
}
