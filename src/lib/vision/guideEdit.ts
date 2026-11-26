import type { NormRect } from "./guides";

export type Corner = "nw" | "ne" | "sw" | "se";

/** 枠の最小サイズ（表示領域に対する割合）。小さすぎると読み取れず、つまみにくい */
export const MIN_SIZE = 0.04;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 動かしても表示領域の外へ出さない */
export function moveRect(r: NormRect, dx: number, dy: number): NormRect {
  return {
    ...r,
    x: clamp(r.x + dx, 0, 1 - r.width),
    y: clamp(r.y + dy, 0, 1 - r.height),
  };
}

/** 動かした角の対角を固定して拡大縮小する。最小サイズ未満・領域外にはならない */
export function resizeRect(r: NormRect, corner: Corner, dx: number, dy: number): NormRect {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.width;
  let bottom = r.y + r.height;

  if (corner === "nw" || corner === "sw") left = clamp(left + dx, 0, right - MIN_SIZE);
  else right = clamp(right + dx, left + MIN_SIZE, 1);
  if (corner === "nw" || corner === "ne") top = clamp(top + dy, 0, bottom - MIN_SIZE);
  else bottom = clamp(bottom + dy, top + MIN_SIZE, 1);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 保存値の検証。壊れた値や範囲外の枠は使わない */
export function isValidRect(r: unknown): r is NormRect {
  if (typeof r !== "object" || r === null) return false;
  const { x, y, width, height } = r as Record<string, unknown>;
  return (
    [x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    (width as number) >= MIN_SIZE &&
    (height as number) >= MIN_SIZE &&
    (x as number) >= 0 &&
    (y as number) >= 0 &&
    (x as number) + (width as number) <= 1.0001 &&
    (y as number) + (height as number) <= 1.0001
  );
}
