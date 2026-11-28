import type { OcrLine } from "@/lib/recognition/paddle/engine";
import type { Rect, Size } from "./framing";

/**
 * 判定表の枠を、カメラの映像に合わせて合わせ直す（自動撮影の下見で使う）。
 * 判定表の枠のまわりを広めに読み、判定の見出し（GREAT・GOOD・BAD・POOR）を探す。見出しの左端と文字の高さ h から、数字の列の位置を決める。
 * 見出しと数字は、軽いモデル（tiny）ではよく 1 行につながって読まれるので、数字の箱ではなく見出しの左端を基準にする。
 *
 * 比率は、実機で撮った 89 枚で、撮影時の枠（ユーザーがきちんと合わせた枠）を見出しの位置から測った中央値（pnpm eval judgeSnap）。
 * ずらした枠を合わせ直すと、判定表を正しく読めた回数が 134 回中 12 → 26 回になった（撮影時の枠のままで 27 回）
 */
const RATIO = { x0: 2.55, x1: 10.46, y0: -1.47, y1: 1.11 };

/** 広めに読む範囲（ユーザーの枠に対して。左に幅 1 つ分・上下に高さの 0.6 倍・右に幅の 0.4 倍） */
export function judgeSearchArea(frame: Rect, view: Size): Rect {
  const x = Math.max(0, frame.x - frame.width);
  const y = Math.max(0, frame.y - frame.height * 0.6);
  const right = Math.min(view.width, frame.x + frame.width * 1.4);
  const bottom = Math.min(view.height, frame.y + frame.height * 1.6);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

const LABEL = /GREAT|GOOD|G[O0]{2}D|BAD|POOR|P[O0]{2}R/i;

/**
 * 広めに読んだ範囲の OCR の行（読んだ画像の画素）から、合わせ直した判定表の枠を返す（表示の座標）。見出しが 2 つ未満なら null
 * area: 読んだ範囲（表示の座標）、size: 読んだ画像の大きさ（画素）
 */
export function snapJudgeFrame(lines: readonly OcrLine[], area: Rect, size: Size): Rect | null {
  const labels = lines.filter((l) => LABEL.test(l.text));
  if (labels.length < 2) return null;
  const k = area.width / size.width;
  const hs = labels.map((l) => l.box.height).sort((a, b) => a - b);
  const h = hs[Math.floor(hs.length / 2)]! * k;
  if (h <= 0) return null;
  const left = area.x + Math.min(...labels.map((l) => l.box.x)) * k;
  const top = area.y + Math.min(...labels.map((l) => l.box.y)) * k;
  const bottom = area.y + Math.max(...labels.map((l) => l.box.y + l.box.height)) * k;
  return { x: left + RATIO.x0 * h, y: top + RATIO.y0 * h, width: (RATIO.x1 - RATIO.x0) * h, height: bottom - top + (RATIO.y1 - RATIO.y0) * h };
}

/** 2 つの枠の重なり（IoU） */
export function overlap(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.width * a.height + b.width * b.height - inter || 1);
}
