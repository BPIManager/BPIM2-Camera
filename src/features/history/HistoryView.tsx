import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import type { ResultRecord } from "@/lib/domain/types";
import { deleteResult, filterResults, listResults } from "@/lib/storage/history";

export default function HistoryView({ active }: { active: boolean }) {
  const [records, setRecords] = useState<ResultRecord[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (active) void listResults().then(setRecords);
  }, [active]);

  const shown = filterResults(records, q);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Input placeholder="曲名で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="履歴を検索" />
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">まだ記録がありません</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
