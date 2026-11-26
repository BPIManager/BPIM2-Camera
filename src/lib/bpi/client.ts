import type { BpiStatus, ChartRef } from "@/lib/domain/types";
import { initialBpiStatus } from "@/lib/domain/score";

/** 最新の IIDX バージョン。BPIM2 のスコアログの参照先・スコアの保存先・ランキングと履歴に使う */
export const LATEST_VERSION = "34";

/**
 * チャートの参照線（アリーナ平均・ライバル平均・ライバルトップ）と、BPI 計算の参照先のバージョン。
 * 最新バージョンはデータがまだ揃っていないため、1 つ前を参照する（LATEST_VERSION とは別に持つ）
 */
export const REFERENCE_VERSION = "33";

export const BPI_API_BASE = "https://bpi2.poyashi.me";

/** BPI 100〜0 の目盛りに必要な EX スコア */
export interface CurvePoint {
  bpi: number;
  score: number;
}

/** アリーナのランク帯ごとの平均 */
export interface ArenaAverage {
  avgExScore: number;
  rate?: number;
  count?: number;
  avgBpi?: number;
}

export interface BpiOutcome {
  status: BpiStatus;
  bpi: number | null;
  estimatedRank: number | null;
  /** 曲の BPI 曲線（チャート用）。API が返さない・算出できない曲は undefined か空 */
  curve?: CurvePoint[];
  arenaAverages?: Record<string, ArenaAverage>;
}

interface BpiCalcResponse {
  song: { title: string; notes: number };
  bpi: number | null;
  rank?: { estimatedRank: number | null };
  curve?: CurvePoint[];
  metadata?: { arenaAverages?: Record<string, ArenaAverage> | null };
}

export interface BpiRequest {
  chart: ChartRef;
  exScore: number;
  version: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * ☆11/12 以外は API を呼ばず「算出対象外」を返す。
 * 返ってきたノーツ数が読み取りと違えば曲の取り違えとして error にする。
 */
export async function fetchBpi(req: BpiRequest): Promise<BpiOutcome> {
  const initial = initialBpiStatus(req.chart.level);
  if (initial === "unsupported-level") {
    return { status: "unsupported-level", bpi: null, estimatedRank: null };
  }
  const f = req.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    title: req.chart.title,
    difficulty: req.chart.difficulty,
    exScore: String(req.exScore),
    version: req.version,
    includeRank: "true",
    includeCurve: "true",
  });
  try {
    const res = await f(
      `${req.baseUrl ?? BPI_API_BASE}/api/v2/bpi/calc?${params}`,
    );
    if (!res.ok) return { status: "error", bpi: null, estimatedRank: null };
    // v2 の共通エンベロープ { error, body }。包まれていない古い形でも読む
    const json = (await res.json()) as { error?: boolean; body?: BpiCalcResponse | null } & Partial<BpiCalcResponse>;
    if (json.error) return { status: "error", bpi: null, estimatedRank: null };
    const body = (json.body ?? json) as BpiCalcResponse;
    if (!body.song || body.song.notes !== req.chart.notes)
      return { status: "error", bpi: null, estimatedRank: null };
    return {
      status: "calculated",
      bpi: body.bpi,
      estimatedRank: body.rank?.estimatedRank ?? null,
      curve: body.curve,
      arenaAverages: body.metadata?.arenaAverages ?? undefined,
    };
  } catch {
    return { status: "pending", bpi: null, estimatedRank: null };
  }
}
