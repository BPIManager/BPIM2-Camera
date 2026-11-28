import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import type { ResultRecord } from "@/lib/domain/types";
import { deleteResult, filterResults, listResults } from "@/lib/storage/history";
import AnalysisSummary from "./AnalysisSummary";

/** 記録に添えた詳細（使用オプション・ミスカウント・FAST/SLOW）。入力・読み取りのあるものだけ */
function details(r: ResultRecord): string[] {
  const out: string[] = [];
  if (r.useOption) out.push(r.useOption);
  if (r.missCount != null) out.push(`ミス ${r.missCount}`);
  if (r.fast != null && r.slow != null) out.push(`F${r.fast} / S${r.slow}`);
  return out;
}

/** 分析（レーダー別の傾向）と、記録の一覧 */
export default function HistoryView({ active }: { active: boolean }) {
  const [records, setRecords] = useState<ResultRecord[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (active) void listResults().then(setRecords);
  }, [active]);

  const shown = filterResults(records, q);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {records.length > 0 && <AnalysisSummary records={records} />}
      <Input placeholder="曲名で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="履歴を検索" className="shrink-0" />
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">まだ記録がありません</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-border py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-sm font-medium">{r.chart.title}</p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <Badge variant="outline">
                    {r.chart.playStyle} ☆{r.chart.level}
                  </Badge>
                  <span>EX {r.exScore}</span>
                  <span>{r.bpiStatus === "calculated" ? `BPI ${r.bpi?.toFixed(2)}` : r.bpiStatus === "unsupported-level" ? "BPI算出対象外" : "BPI未算出"}</span>
                </p>
                {details(r).length > 0 && <p className="truncate text-xs text-muted-foreground tabular-nums">{details(r).join("・")}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${r.chart.title}を削除`}
                onClick={async () => {
                  await deleteResult(r.id);
                  setRecords((prev) => prev.filter((x) => x.id !== r.id));
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
