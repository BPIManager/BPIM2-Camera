import { useEffect, useMemo, useState } from "react";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { summarizeByRadar, type CategorySummary, type Mean, type RadarCategory, type RadarTop } from "@/lib/analysis/summary";
import type { ResultRecord } from "@/lib/domain/types";

// FAST 率は、FAST・SLOW を読み取れるようになるまで出さない（いまは記録に値がない）
type Metric = "bpi" | "scoreRate" | "missCount";

const METRICS: { id: Metric; label: string; format: (v: number) => string; note: string }[] = [
  { id: "bpi", label: "BPI", format: (v) => v.toFixed(2), note: "BPI を算出できた記録の平均" },
  { id: "scoreRate", label: "スコア率", format: (v) => `${(v * 100).toFixed(1)}%`, note: "EX ÷ 理論値の平均" },
  { id: "missCount", label: "ミス", format: (v) => v.toFixed(1), note: "ミスカウントの平均。結果画面で入力した記録だけ" },
];

const LABEL: Record<RadarCategory, string> = { NOTES: "NOTES", CHORD: "CHORD", PEAK: "PEAK", CHARGE: "CHARGE", SCRATCH: "SCRATCH", SOFLAN: "SOFLAN" };

/** BPIM2 の、譜面ごとの最も高いレーダーの項目（初めて開いたときに読み込む） */
function useRadarTop(): RadarTop | null {
  const [top, setTop] = useState<RadarTop | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/generated/radar-top.json").then((m) => alive && setTop(new Map(Object.entries(m.default as Record<string, RadarCategory>))));
    return () => {
      alive = false;
    };
  }, []);
  return top;
}

/** 棒の長さ（0〜1）と、0 の位置（0〜1）。BPI は負になりうるので、0 を含む範囲で描く */
function scale(rows: readonly CategorySummary[], metric: Metric) {
  const values = rows.flatMap((r) => (r[metric] ? [r[metric]!.value] : []));
  const fixed = metric === "scoreRate" ? { lo: 0, hi: 1 } : null;
  const lo = fixed?.lo ?? Math.min(0, ...values);
  const hi = fixed?.hi ?? Math.max(...values, metric === "bpi" ? 100 : 1);
  const at = (v: number) => (v - lo) / (hi - lo || 1);
  return { at, zero: at(0) };
}

/**
 * 分析: 履歴の記録を、譜面の最も高いレーダーの項目（NOTES・CHORD・PEAK・CHARGE・SCRATCH・SOFLAN）ごとにまとめて比べる。
 * 指標（BPI・スコア率・FAST率・ミス）を切り替えて、項目ごとの横棒で示す
 */
export default function AnalysisSummary({ records }: { records: readonly ResultRecord[] }) {
  const top = useRadarTop();
  const [metric, setMetric] = useState<Metric>("bpi");
  const summary = useMemo(() => (top ? summarizeByRadar(records, top) : null), [records, top]);
  const m = METRICS.find((x) => x.id === metric)!;
  if (!summary) return null;
  const counted = summary.rows.reduce((a, r) => a + r.plays, 0);
  const { at, zero } = scale(summary.rows, metric);

  return (
    <section className="flex shrink-0 flex-col gap-3 rounded-md border border-border p-3" aria-label="レーダー別の傾向">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">レーダー別の傾向</h2>
        <p className="text-xs text-muted-foreground">譜面のいちばん高いレーダーの項目ごとに、記録をまとめています（SP ☆11・☆12 の {counted} 件）</p>
      </div>
      <RadioGroup value={metric} onValueChange={(v) => setMetric(v as Metric)} aria-label="指標" className="grid-cols-3 gap-1">
        {METRICS.map((x) => (
          <RadioItem key={x.id} value={x.id} className="h-9 px-1 text-xs">
            {x.label}
          </RadioItem>
        ))}
      </RadioGroup>
      <ul className="flex flex-col gap-1.5">
        {summary.rows.map((r) => {
          const v: Mean | null = r[metric];
          const left = v ? Math.min(at(v.value), zero) : zero;
          const width = v ? Math.abs(at(v.value) - zero) : 0;
          return (
            <li key={r.category} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2 text-xs">
              <span className="font-medium">{LABEL[r.category]}</span>
              <span className="relative h-3 rounded-sm bg-muted" aria-hidden>
                {metric === "bpi" && zero > 0 && <span className="absolute inset-y-0 w-px bg-border" style={{ left: `${zero * 100}%` }} />}
                {v && <span className="absolute inset-y-0 rounded-sm bg-primary" style={{ left: `${left * 100}%`, width: `${Math.max(width * 100, 1)}%` }} />}
              </span>
              <span className="text-right tabular-nums">
                {v ? (
                  <>
                    {m.format(v.value)}
                    <span className="ml-1 text-muted-foreground">({v.n})</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{m.note}。括弧内は件数</p>
    </section>
  );
}
