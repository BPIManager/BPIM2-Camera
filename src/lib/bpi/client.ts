import type { BpiStatus, ChartRef } from "@/lib/domain/types";
import { initialBpiStatus } from "@/lib/domain/score";

export const BPI_API_BASE = "https://bpi2.poyashi.me";

export interface BpiOutcome {
  status: BpiStatus;
  bpi: number | null;
  estimatedRank: number | null;
}

interface BpiCalcResponse {
  song: { title: string; notes: number };
  bpi: number | null;
  rank?: { estimatedRank: number | null };
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
  });
  try {
    const res = await f(`${req.baseUrl ?? BPI_API_BASE}/api/v2/bpi/calc?${params}`);
    if (!res.ok) return { status: "error", bpi: null, estimatedRank: null };
    const body = (await res.json()) as BpiCalcResponse;
    if (body.song.notes !== req.chart.notes) return { status: "error", bpi: null, estimatedRank: null };
    return { status: "calculated", bpi: body.bpi, estimatedRank: body.rank?.estimatedRank ?? null };
  } catch {
    return { status: "pending", bpi: null, estimatedRank: null };
  }
}
