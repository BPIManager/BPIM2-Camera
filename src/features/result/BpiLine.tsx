import type { ResultRecord } from "@/lib/domain/types";

/** BPI の表示。☆10以下は「BPI算出対象外」、未算出は復帰後に計算する旨を出す */
export default function BpiLine({ record }: { record: ResultRecord }) {
  switch (record.bpiStatus) {
    case "calculated":
      return (
        <p className="text-3xl font-semibold tabular-nums">
          {record.bpi?.toFixed(2)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">BPI</span>
        </p>
      );
    case "unsupported-level":
      return <p className="text-sm text-muted-foreground">BPI算出対象外（☆{record.chart.level}）</p>;
    case "pending":
      return <p className="text-sm text-muted-foreground">BPIは通信できたときに計算します</p>;
    case "error":
      return <p className="text-sm text-warning">BPIを算出できませんでした。曲と譜面を確認してください</p>;
  }
}
