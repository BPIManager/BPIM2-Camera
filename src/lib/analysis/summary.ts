import type { ChartRef, ResultRecord } from "@/lib/domain/types";

/** 楽曲のレーダーの項目（BPIM2 と同じ並び） */
export const RADAR_CATEGORIES = ["NOTES", "CHORD", "PEAK", "CHARGE", "SCRATCH", "SOFLAN"] as const;
export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

/** 譜面 → 最も高いレーダーの項目。データは SP の ☆11・☆12（BPIM2 の topElements）だけ */
export type RadarTop = ReadonlyMap<string, RadarCategory>;

export const radarKey = (chart: Pick<ChartRef, "title" | "difficulty">) => `${chart.title}___${chart.difficulty}`;

export function radarOf(chart: ChartRef, top: RadarTop): RadarCategory | null {
  if (chart.playStyle !== "SP") return null;
  return top.get(radarKey(chart)) ?? null;
}

/** 平均と、平均のもとになった件数 */
export interface Mean {
  value: number;
  n: number;
}

export interface CategorySummary {
  category: RadarCategory;
  /** プレー（記録）の数 */
  plays: number;
  /** 譜面の数（同じ譜面を何度もプレーしても 1） */
  charts: number;
  /** BPI の平均（算出できた記録だけ） */
  bpi: Mean | null;
  /** スコア率（EX ÷ 理論値）の平均。0〜1 */
  scoreRate: Mean | null;
  /** FAST 率（FAST ÷（FAST＋SLOW））の平均。FAST・SLOW を入力した記録だけ。0〜1 */
  fastRate: Mean | null;
  /** ミスカウントの平均。入力（読み取り）した記録だけ */
  missCount: Mean | null;
}

const mean = (xs: readonly number[]): Mean | null => (xs.length === 0 ? null : { value: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length });

/**
 * 履歴の記録を、譜面の最も高いレーダーの項目ごとにまとめる。レーダーの項目が分からない譜面（☆10 以下・DP など）は数えない。
 * 返り値は RADAR_CATEGORIES の順で、記録のない項目も含める（plays 0）
 */
export function summarizeByRadar(records: readonly ResultRecord[], top: RadarTop): { rows: CategorySummary[]; uncategorized: number } {
  const groups = new Map<RadarCategory, ResultRecord[]>();
  let uncategorized = 0;
  for (const r of records) {
    const c = radarOf(r.chart, top);
    if (!c) {
      uncategorized++;
      continue;
    }
    groups.set(c, [...(groups.get(c) ?? []), r]);
  }
  const rows = RADAR_CATEGORIES.map((category): CategorySummary => {
    const rs = groups.get(category) ?? [];
    return {
      category,
      plays: rs.length,
      charts: new Set(rs.map((r) => r.chart.songId)).size,
      bpi: mean(rs.flatMap((r) => (r.bpiStatus === "calculated" && r.bpi !== null ? [r.bpi] : []))),
      scoreRate: mean(rs.flatMap((r) => (r.chart.notes > 0 ? [r.exScore / (r.chart.notes * 2)] : []))),
      fastRate: mean(rs.flatMap((r) => (r.fast != null && r.slow != null && r.fast + r.slow > 0 ? [r.fast / (r.fast + r.slow)] : []))),
      missCount: mean(rs.flatMap((r) => (r.missCount != null ? [r.missCount] : []))),
    };
  });
  return { rows, uncategorized };
}
