import { Crown, TrendingUp } from "lucide-react";
import { List, type RowComponentProps } from "react-window";
import Badge from "@/components/ui/badge";
import { groupHistoryByVersion, type HistoryEntry, type HistoryRecord } from "@/lib/bpi/songData";
import { versionTitle } from "@/lib/iidx/versionTitles";
import { cn } from "@/lib/utils";
import { SignInPrompt } from "./SignInPrompt";

interface Props {
  signedIn: boolean;
  history: { data: HistoryEntry[] | null; loading: boolean };
}

type Row = { kind: "header"; version: string } | { kind: "record"; record: HistoryRecord };

const HEADER_HEIGHT = 36;
const RECORD_HEIGHT = 76;

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "日付不明";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "日付不明"
    : d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function HistoryRow({ index, style, rows, best }: RowComponentProps<{ rows: Row[]; best: number | null }>) {
  const row = rows[index];
  if (row.kind === "header") {
    return (
      <div style={style} className="flex items-end gap-3 px-1 pb-1">
        <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground">{versionTitle(row.version)}</span>
        <span className="mb-1.5 h-px flex-1 bg-border" />
      </div>
    );
  }
  const { record: r } = row;
  const isBest = best !== null && r.exScore === best;
  return (
    <div style={style} className="px-1 py-1">
      <div className={cn("flex h-full flex-col justify-center gap-1 rounded-md border-l-2 bg-secondary/40 px-3", isBest ? "border-warning" : "border-border")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">{fmtDateTime(r.lastPlayed)}</span>
          <span className="flex items-center gap-1.5">
            {r.scoreDiff !== null && r.scoreDiff > 0 && (
              <Badge variant="success" className="gap-0.5">
                <TrendingUp className="size-3" />+{r.scoreDiff}
              </Badge>
            )}
            {isBest && (
              <Badge variant="warning" className="gap-0.5">
                <Crown className="size-3" />
                BEST
              </Badge>
            )}
          </span>
        </div>
        <div className="flex items-baseline gap-3 tabular-nums">
          <span className={cn("text-lg font-semibold leading-none", isBest && "text-warning")}>{r.exScore}</span>
          {r.bpi !== null && <span className="text-xs text-muted-foreground">BPI {r.bpi.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  );
}

const Message = ({ children }: { children: string }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

/** 過去の自分のスコア。バージョンごとにまとめ、新しい順に並べる。一覧の中だけがスクロールする */
export default function HistoryPanel({ signedIn, history }: Props) {
  if (!signedIn) return <SignInPrompt text="BPIM2 にサインインすると、この曲の過去のスコアが見られます。" />;
  if (history.loading) return <Message>読み込んでいます</Message>;
  if (!history.data) return <Message>履歴を取得できませんでした</Message>;
  if (history.data.length === 0) return <Message>BPIM2 に、この曲の記録がまだありません</Message>;

  const best = Math.max(...history.data.map((h) => h.exScore));
  const rows: Row[] = groupHistoryByVersion(history.data).flatMap((g) => [
    { kind: "header", version: g.version } as const,
    ...g.records.map((record) => ({ kind: "record", record }) as const),
  ]);

  return (
    <List
      rowCount={rows.length}
      rowHeight={(i) => (rows[i].kind === "header" ? HEADER_HEIGHT : RECORD_HEIGHT)}
      rowComponent={HistoryRow}
      rowProps={{ rows, best }}
      style={{ position: "absolute", inset: 0 }}
      className="overscroll-contain"
    />
  );
}
