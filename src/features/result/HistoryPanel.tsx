import { Calendar, Crown, TrendingUp } from "lucide-react";
import { List, type RowComponentProps } from "react-window";
import Badge from "@/components/ui/badge";
import { djRankPair } from "@/lib/domain/djRank";
import { groupHistoryByVersion, type HistoryEntry, type HistoryRecord } from "@/lib/bpi/songData";
import { versionTitle } from "@/lib/iidx/versionTitles";
import { cn } from "@/lib/utils";
import { SignInPrompt } from "./SignInPrompt";

interface Props {
  signedIn: boolean;
  history: { data: HistoryEntry[] | null; loading: boolean };
  /** 理論値（ノーツ数 × 2）。DJ ランクの表記（AAA+12 / MAX-34）に使う */
  maxScore: number;
}

type Row = { kind: "header"; version: string } | { kind: "record"; record: HistoryRecord };

const HEADER_HEIGHT = 32;
/** カード（日付の行・スコアと BPI と DJ ランク・ランプとミス）と、カードの間のすきま */
const RECORD_HEIGHT = 100;

/** 2026/11/28 18:52（日本時間。BPIM2 の履歴と同じ書式） */
const fmtDateTime = (iso: string | null) => {
  if (!iso) return "日付不明";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "日付不明";
  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
};

function HistoryRow({ index, style, rows, best, maxScore }: RowComponentProps<{ rows: Row[]; best: number | null; maxScore: number }>) {
  const row = rows[index];
  if (row.kind === "header") {
    return (
      <div style={style} className="flex items-end gap-3 px-1 pb-1.5">
        <span className="shrink-0 text-[10px] font-black tracking-widest text-muted-foreground uppercase">{versionTitle(row.version)}</span>
        <span className="mb-1 h-px flex-1 bg-border" />
      </div>
    );
  }
  const { record: r } = row;
  const isBest = best !== null && r.exScore === best;
  const dj = maxScore > 0 ? djRankPair(r.exScore, maxScore) : null;
  return (
    <div style={style} className="px-1 pb-2.5">
      <div className={cn("flex h-full flex-col justify-between rounded-lg border-l-[3px] bg-secondary/60 px-3 py-2.5", isBest ? "border-warning shadow-[0_0_15px_rgba(234,179,8,0.1)]" : "border-border")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="size-3" aria-hidden />
            <span className="font-mono text-[10px] font-bold">{fmtDateTime(r.lastPlayed)}</span>
            {r.useOption && <span className="font-mono text-[10px] font-bold">{r.useOption}</span>}
          </div>
          <div className="flex items-center gap-2">
            {r.scoreDiff !== null && r.scoreDiff > 0 && (
              <Badge className="h-4 gap-0.5 border border-success/20 bg-success/10 px-1.5 py-0 text-[9px] font-bold text-success">
                <TrendingUp className="size-2.5" aria-hidden />+{r.scoreDiff}
              </Badge>
            )}
            {isBest && (
              <Badge variant="warning" className="h-4 gap-0.5 px-1.5 py-0 text-[9px] font-black">
                <Crown className="size-2.5" aria-hidden />
                BEST
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <span className={cn("font-mono text-lg leading-none font-black tracking-tighter", isBest ? "text-warning" : "text-foreground")}>{r.exScore}</span>
            {r.bpi !== null && <span className="font-mono text-[10px] font-bold text-muted-foreground">BPI: {r.bpi.toFixed(2)}</span>}
            {dj && (
              <span className="font-mono text-[10px] font-bold text-muted-foreground">
                {dj.current} / {dj.next}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-black text-foreground uppercase">{r.clearState || "NO PLAY"}</span>
            {r.missCount !== null && <span className="font-mono text-[9px] font-bold text-destructive/80">MISS: {r.missCount}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const Message = ({ children }: { children: string }) => <p className="py-6 text-center text-xs text-muted-foreground">{children}</p>;

/** 過去の自分のスコア。バージョンごとにまとめ、新しい順に並べる（BPIM2 の履歴と同じ見た目）。一覧の中だけがスクロールする */
export default function HistoryPanel({ signedIn, history, maxScore }: Props) {
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
      rowProps={{ rows, best, maxScore }}
      style={{ position: "absolute", inset: 0 }}
      className="overscroll-contain"
    />
  );
}
