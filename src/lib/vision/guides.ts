import type { PlaySide } from "@/lib/storage/settings";
import type { Rect, Size } from "./framing";

/** 0〜1 に正規化した矩形（カメラ表示領域に対する割合） */
export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GuideLayout {
  /** 今回スコアの数字 */
  score: NormRect;
  /** 曲名・難易度・ノーツ数の帯 */
  title: NormRect;
}

export type GuideKey = keyof GuideLayout;

const LAYOUT_1P: GuideLayout = {
  score: { x: 0.32, y: 0.43, width: 0.19, height: 0.055 },
  title: { x: 0.59, y: 0.6, width: 0.41, height: 0.095 },
};

const mirrorRect = (r: NormRect): NormRect => ({ ...r, x: 1 - r.x - r.width });

export function mirrorLayout(l: GuideLayout): GuideLayout {
  return { score: mirrorRect(l.score), title: mirrorRect(l.title) };
}

/** 2P はリザルト画面の左右が反転するので、1P の配置を左右反転する */
export const GUIDE_LAYOUTS: Record<PlaySide, GuideLayout> = {
  "1P": LAYOUT_1P,
  "2P": mirrorLayout(LAYOUT_1P),
};

export type CustomGuides = Partial<Record<PlaySide, GuideLayout>>;

/**
 * 使う配置を決める。ユーザーが調整した配置を優先し、
 * 反対側だけ調整済みならそれを左右反転して使う。どちらもなければ既定値。
 */
export function resolveLayout(side: PlaySide, custom: CustomGuides | undefined): GuideLayout {
  const own = custom?.[side];
  if (own) return own;
  const other = custom?.[side === "1P" ? "2P" : "1P"];
  return other ? mirrorLayout(other) : GUIDE_LAYOUTS[side];
}

export interface GuideRects {
  score: Rect;
  title: Rect;
}

export function layoutToRects(layout: GuideLayout, view: Size): GuideRects {
  const px = (n: NormRect): Rect => ({
    x: n.x * view.width,
    y: n.y * view.height,
    width: n.width * view.width,
    height: n.height * view.height,
  });
  return { score: px(layout.score), title: px(layout.title) };
}

export function guideRects(side: PlaySide, view: Size, custom?: CustomGuides): GuideRects {
  return layoutToRects(resolveLayout(side, custom), view);
}
