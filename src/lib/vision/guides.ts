import type { PlaySide } from "@/lib/storage/settings";
import type { Rect, Size } from "./framing";

/** 0〜1 に正規化した矩形（カメラ表示領域に対する割合） */
export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GUIDE_KEYS = ["score", "title", "judge"] as const;
export type GuideKey = (typeof GUIDE_KEYS)[number];

/** 撮影枠。それぞれ、画面のこの部分を枠に重ねて撮ってもらう */
export type GuideLayout = Record<GuideKey, NormRect>;

export const GUIDE_LABELS: Record<GuideKey, string> = {
  score: "スコア",
  title: "曲名・譜面",
  judge: "判定",
};

/** 1P の既定の配置（サンプル画像から割り出した値。端末や距離によってずれるので設定で調整できる） */
const LAYOUT_1P: GuideLayout = {
  score: { x: 0.32, y: 0.436, width: 0.19, height: 0.045 },
  title: { x: 0.59, y: 0.6, width: 0.41, height: 0.095 },
  judge: { x: 0.32, y: 0.565, width: 0.15, height: 0.085 },
};

const mirrorRect = (r: NormRect): NormRect => ({ ...r, x: 1 - r.x - r.width });

export function mirrorLayout(l: GuideLayout): GuideLayout {
  return { score: mirrorRect(l.score), title: mirrorRect(l.title), judge: mirrorRect(l.judge) };
}

/** 2P はリザルト画面の左右が反転するので、1P の配置を左右反転する */
export const GUIDE_LAYOUTS: Record<PlaySide, GuideLayout> = {
  "1P": LAYOUT_1P,
  "2P": mirrorLayout(LAYOUT_1P),
};

/** 保存された調整。古い設定は一部の枠だけを持つので、足りない枠は既定値で補う */
export type CustomGuides = Partial<Record<PlaySide, Partial<GuideLayout>>>;

/**
 * 使う配置を決める。ユーザーが調整した配置を優先し（足りない枠は既定値）、
 * 反対側だけ調整済みならそれを左右反転して使う。どちらもなければ既定値。
 */
export function resolveLayout(side: PlaySide, custom: CustomGuides | undefined): GuideLayout {
  const own = custom?.[side];
  if (own) return { ...GUIDE_LAYOUTS[side], ...own };
  const otherSide: PlaySide = side === "1P" ? "2P" : "1P";
  const other = custom?.[otherSide];
  return other ? mirrorLayout({ ...GUIDE_LAYOUTS[otherSide], ...other }) : GUIDE_LAYOUTS[side];
}

export type GuideRects = Record<GuideKey, Rect>;

export function layoutToRects(layout: GuideLayout, view: Size): GuideRects {
  const px = (n: NormRect): Rect => ({
    x: n.x * view.width,
    y: n.y * view.height,
    width: n.width * view.width,
    height: n.height * view.height,
  });
  return { score: px(layout.score), title: px(layout.title), judge: px(layout.judge) };
}

export function guideRects(side: PlaySide, view: Size, custom?: CustomGuides): GuideRects {
  return layoutToRects(resolveLayout(side, custom), view);
}
