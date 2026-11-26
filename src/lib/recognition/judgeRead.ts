/** 判定表の枠で読めた数字 1 つ（確度は 0〜100。同じ数字が複数回読めたときは最大） */
export interface JudgeRead {
  n: number;
  conf: number;
}

/**
 * GR として組み合わせに使ってよい読みか。判定の枠には背景の模様やゴミが小さい数字として読まれやすく、
 * 実際の GR が小さいときと区別できない。偶然の一致を避けるため、20 以上か、確度 90 以上のものだけ使う。
 */
export function isReliableGr(r: JudgeRead): boolean {
  return r.n >= 20 || r.conf >= 90;
}
