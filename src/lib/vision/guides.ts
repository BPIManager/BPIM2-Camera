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

/** 保存されたキャリブレーション結果（旧版の 1P/2P 別の保存値。移行にだけ使う） */
export type CustomGuides = Partial<Record<PlaySide, Partial<GuideLayout>>>;

/** 旧版の設定（プレーサイドと 1P/2P 別の調整）から、いまの 1 つの配置へ移す。調整がなければ null */
export function migrateLegacyLayout(side: PlaySide, custom: CustomGuides | undefined): GuideLayout | null {
  const otherSide: PlaySide = side === "1P" ? "2P" : "1P";
  const own = custom?.[side];
  if (own) return { ...GUIDE_LAYOUTS[side], ...own };
  const other = custom?.[otherSide];
  return other ? mirrorLayout({ ...GUIDE_LAYOUTS[otherSide], ...other }) : null;
}

/** 使う配置。キャリブレーション済みならそれ、なければ既定値（1P） */
export function resolveLayout(custom: GuideLayout | null | undefined): GuideLayout {
  return custom ?? GUIDE_LAYOUTS["1P"];
}

/** スコア枠が画面の左右どちらにあるかから、プレーサイドを推定する（学習サンプルのメタ情報用） */
export function inferSide(layout: GuideLayout): PlaySide {
  return layout.score.x + layout.score.width / 2 < 0.5 ? "1P" : "2P";
}

export type GuideRects = Record<GuideKey, Rect>;

/**
 * 枠の基準になる矩形。キャリブレーションに使った写真の縦横比（幅 / 高さ）で、表示領域に収まる最大の矩形を中央に置く。
 * 枠は写真に対する割合で保存しているので、写真とカメラの縦横比が違っても、写真と同じ構図で撮れば枠が合う。
 * 縦横比が未設定（キャリブレーション前）なら表示領域の全体。
 */
export function referenceRect(view: Size, aspect?: number | null): Rect {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0 || view.width <= 0 || view.height <= 0) {
    return { x: 0, y: 0, width: view.width, height: view.height };
  }
  const width = Math.min(view.width, view.height * aspect);
  const height = width / aspect;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

export function layoutToRects(layout: GuideLayout, view: Size, aspect?: number | null): GuideRects {
  const ref = referenceRect(view, aspect);
  const px = (n: NormRect): Rect => ({
    x: ref.x + n.x * ref.width,
    y: ref.y + n.y * ref.height,
    width: n.width * ref.width,
    height: n.height * ref.height,
  });
  return { score: px(layout.score), title: px(layout.title), judge: px(layout.judge) };
}

export function guideRects(view: Size, layout?: GuideLayout | null, aspect?: number | null): GuideRects {
  return layoutToRects(resolveLayout(layout), view, aspect);
}
