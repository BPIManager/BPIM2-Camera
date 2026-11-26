import type { PlaySide } from "@/lib/storage/settings";
import type { Rect, Size } from "./framing";

/** 0〜1 に正規化した矩形（表示領域に対する割合） */
interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GuideLayout {
  /** 今回スコアの数字 */
  score: NormRect;
  /** 曲名・難易度・ノーツ数の帯 */
  title: NormRect;
}

const LAYOUT_1P: GuideLayout = {
  score: { x: 0.32, y: 0.43, width: 0.19, height: 0.055 },
  title: { x: 0.59, y: 0.6, width: 0.41, height: 0.095 },
};

const mirror = (r: NormRect): NormRect => ({ ...r, x: 1 - r.x - r.width });

/** 2P はリザルト画面の左右が反転するので、1P の配置を左右反転する */
export const GUIDE_LAYOUTS: Record<PlaySide, GuideLayout> = {
  "1P": LAYOUT_1P,
  "2P": { score: mirror(LAYOUT_1P.score), title: mirror(LAYOUT_1P.title) },
};

export interface GuideRects {
  score: Rect;
  title: Rect;
}

export function guideRects(side: PlaySide, view: Size): GuideRects {
  const px = (n: NormRect): Rect => ({
    x: n.x * view.width,
    y: n.y * view.height,
    width: n.width * view.width,
    height: n.height * view.height,
  });
  const l = GUIDE_LAYOUTS[side];
  return { score: px(l.score), title: px(l.title) };
}
