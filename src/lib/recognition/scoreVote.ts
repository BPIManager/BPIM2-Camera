export interface ScoreVote {
  /** 2 回以上の読み取りで一致し、範囲内の値。なければ null */
  value: number | null;
  /** 確度順の候補（最大 3 件） */
  candidates: number[];
}

/** 先頭が + のトークン（スコア差分の表示）は除く。1〜4 桁の数字だけを拾う */
function numbersIn(tokens: readonly string[]): number[] {
  return tokens.flatMap((t) => {
    const s = t.trim();
    return /^[0-9]{1,4}$/.test(s) ? [Number(s)] : [];
  });
}

/**
 * 前処理ごとの OCR 結果（1 件 = 1 回の読み取り）から EX スコアを多数決で決める。
 * 範囲（0〜ノーツ数×2）外の値は除外する。一致が 2 回未満なら確定せず候補だけ返す。
 */
export function voteScore(readings: readonly (readonly string[])[], notes: number | null): ScoreVote {
  const max = notes ? notes * 2 : 9999;
  const votes = new Map<number, number>();
  for (const tokens of readings) {
    for (const n of new Set(numbersIn(tokens))) {
      if (n >= 1 && n <= max) votes.set(n, (votes.get(n) ?? 0) + 1);
    }
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || String(b[0]).length - String(a[0]).length || b[0] - a[0]);
  const top = ranked[0];
  const second = ranked[1];
  const unique = top !== undefined && (second === undefined || top[1] > second[1]);
  return {
    // ノーツ数が分からないと範囲で検証できないので確定しない。1〜2 桁の EX は誤読の可能性が高い
    value: top && top[1] >= 2 && unique && notes !== null && top[0] >= 100 ? top[0] : null,
    candidates: ranked.slice(0, 3).map(([n]) => n),
  };
}
