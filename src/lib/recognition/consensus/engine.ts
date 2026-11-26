import { isNearestBoundary, rankRange, rankThreshold, type Rank } from "./ranks";

/** EX の候補を作る独立した情報源 */
export type SourceId = "score" | "judge" | "judgeSum" | "rankGap" | "diff";

/** 画面から読めた観測値。読めなかった項目は省く。値は読み誤りを含みうる */
export interface Observations {
  /** 譜面のノーツ数（曲特定の結果） */
  notes: number;
  /** スコア欄の数字の読み（前処理や読み取り器ごとに複数あってよい） */
  score?: number[];
  /** ジャッジ表。PG と GR があれば EX を作れ、5 種すべてが読めれば合計をノーツ数と照合できる */
  judge?: { pg?: number; gr?: number; gd?: number; bd?: number; poor?: number };
  /** DJ LEVEL 行の差分表示（`AAA +0104`・`MAX -0201`）。符号が読めないときは null */
  rankGap?: { rank: Rank; sign: "+" | "-" | null; gap: number };
  /** 今回の DJ LEVEL（ランクの文字）。EX の範囲の制約に使う */
  currentRank?: Rank;
  /** スコア欄の下の差分表示（`+3304`）と、ベストスコア。EX ＝ ベスト ＋ 差分 */
  diff?: { value: number; best: number };
}

export interface Candidate {
  value: number;
  sources: SourceId[];
  /** 情報源の重みの合計。2 以上で独立した裏付けが 2 つ以上ある */
  weight: number;
}

export type ConsensusStatus = "confirmed" | "ambiguous" | "insufficient";

export interface ConsensusResult {
  status: ConsensusStatus;
  /** confirmed のときだけ値が入る */
  value: number | null;
  /** 重み順の候補（UI の候補チップ用）。制約に反する値は含まない */
  ranked: Candidate[];
  /** 制約に反して捨てた候補とその理由（デバッグ・評価用） */
  rejected: { value: number; source: SourceId; reason: string }[];
}

const WEIGHT: Record<SourceId, number> = { score: 1, judge: 1, judgeSum: 1, rankGap: 1, diff: 1 };
/** 合計がノーツ数と合わなかったジャッジ表は、読み誤りの疑いがあるので重みを半分にする */
const INCONSISTENT_JUDGE = 0.5;

interface Raw {
  value: number;
  source: SourceId;
  weight: number;
}

/** 観測値から、情報源ごとに EX の候補を作る */
function generate(o: Observations): Raw[] {
  const out: Raw[] = [];
  const add = (value: number, source: SourceId, weight = WEIGHT[source]) => out.push({ value, source, weight });

  for (const v of o.score ?? []) add(v, "score");

  const j = o.judge;
  if (j?.pg !== undefined && j.gr !== undefined) {
    const ex = j.pg * 2 + j.gr;
    const all = [j.pg, j.gr, j.gd, j.bd, j.poor];
    if (all.every((n) => n !== undefined)) {
      const sum = (all as number[]).reduce((a, b) => a + b, 0);
      if (sum === o.notes) {
        // 5 種の合計がノーツ数と一致すれば、独立した検算が通ったとみなす
        add(ex, "judge");
        add(ex, "judgeSum");
      } else {
        add(ex, "judge", INCONSISTENT_JUDGE);
      }
    } else {
      add(ex, "judge");
    }
  }

  const g = o.rankGap;
  if (g) {
    const t = rankThreshold(g.rank, o.notes);
    // 符号が読めないときは両方を候補にし、範囲と最近接の制約で絞る
    if (g.sign !== "-") add(t + g.gap, "rankGap");
    if (g.sign !== "+") add(t - g.gap, "rankGap");
  }

  if (o.diff) add(o.diff.best + o.diff.value, "diff");
  return out;
}

/**
 * 複数の独立した読みから EX スコアを決める。
 * ノーツ数から EX の範囲と DJ LEVEL の基準点が分かるので、ありえない値を先に除き、
 * 残った値を、独立した情報源の重みの合計で比べる。
 * 重み 2 以上（独立した裏付け 2 つ以上）で、次点と 1 以上差があるときだけ確定する。
 */
export function decideExScore(o: Observations): ConsensusResult {
  const rejected: ConsensusResult["rejected"] = [];
  const max = o.notes * 2;
  const range = o.currentRank ? rankRange(o.currentRank, o.notes) : null;

  const valid: Raw[] = [];
  for (const r of generate(o)) {
    const reject = (reason: string) => rejected.push({ value: r.value, source: r.source, reason });
    if (!Number.isInteger(r.value) || r.value < 0 || r.value > max) reject("範囲外（0〜ノーツ数×2）");
    else if (range && (r.value < range.min || r.value > range.max)) reject(`今回のランク ${o.currentRank} の範囲外`);
    else if (r.source === "rankGap" && o.rankGap && !isNearestBoundary(o.rankGap.rank, r.value, o.notes)) reject("差分の基準が最も近い基準点でない");
    else valid.push(r);
  }

  const byValue = new Map<number, Candidate>();
  for (const r of valid) {
    const c = byValue.get(r.value) ?? { value: r.value, sources: [], weight: 0 };
    // 同じ情報源が複数の読みで同じ値を出しても、一度だけ数える
    if (!c.sources.includes(r.source)) {
      c.sources.push(r.source);
      c.weight += r.weight;
    }
    byValue.set(r.value, c);
  }

  const ranked = [...byValue.values()].sort((a, b) => b.weight - a.weight || b.sources.length - a.sources.length);
  const [top, second] = ranked;
  if (!top) return { status: "insufficient", value: null, ranked, rejected };
  const lead = top.weight - (second?.weight ?? 0);
  if (top.weight >= 2 && lead >= 1) return { status: "confirmed", value: top.value, ranked, rejected };
  return { status: top.weight >= 2 ? "ambiguous" : "insufficient", value: null, ranked, rejected };
}
