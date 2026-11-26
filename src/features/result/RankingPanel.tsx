import { useEffect, useState } from "react";
import { List, useListRef, type RowComponentProps } from "react-window";
import Avatar from "@/components/ui/avatar";
import { LATEST_VERSION } from "@/lib/bpi/client";
import { fetchGlobalRanking, fetchRivalRanking, rankWithSelf, type RankRow, type SelfInfo } from "@/lib/bpi/songData";
import type { ChartRef } from "@/lib/domain/types";
import { useRemote } from "@/hooks/useRemote";
import { cn } from "@/lib/utils";
import { SignInPrompt } from "./SignInPrompt";

type Scope = "rival" | "global";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "rival", label: "ライバル" },
  { id: "global", label: "グローバル" },
];

const ROW_HEIGHT = 56;

interface Props {
  /** null なら未サインイン */
  self: SelfInfo | null;
  chart: ChartRef;
  exScore: number;
  bpi: number | null;
}

function RankingRow({ index, style, rows, selfEx }: RowComponentProps<{ rows: RankRow[]; selfEx: number }>) {
  const r = rows[index];
  const diff = r.exScore - selfEx;
  return (
    <div style={style} className="px-1">
      <div className={cn("flex h-full items-center gap-3 border-b border-border px-2", r.isSelf && "bg-warning/10")}>
        <span className="w-9 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{r.rank}</span>
        <Avatar src={r.profileImage} name={r.userName || "?"} className="size-8 text-xs" />
        <p className={cn("min-w-0 flex-1 truncate text-sm", r.isSelf && "font-semibold")}>{r.isSelf ? `${r.userName || "あなた"}（今回）` : r.userName}</p>
        <div className="flex shrink-0 flex-col items-end tabular-nums">
          <span className="text-sm font-medium">{r.exScore}</span>
          <span className="text-[11px] text-muted-foreground">{r.bpi !== null ? `BPI ${r.bpi.toFixed(2)}` : ""}</span>
        </div>
        <span className={cn("w-12 shrink-0 text-right text-xs tabular-nums", r.isSelf ? "text-transparent" : diff > 0 ? "text-destructive" : "text-success")} aria-hidden={r.isSelf}>
          {diff > 0 ? `+${diff}` : diff}
        </span>
      </div>
    </div>
  );
}

const Message = ({ children }: { children: string }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

/** 今回のスコアで入ったときの順位表。ライバル（フォロー中）とグローバルを切り替える。最初は自分が中央に来るようにスクロールする */
export default function RankingPanel({ self, chart, exScore, bpi }: Props) {
  const [scope, setScope] = useState<Scope>("rival");
  const listRef = useListRef(null);
  const { data, loading } = useRemote(self ? `${scope}:${self.userId}:${chart.songId}` : null, () =>
    scope === "rival" ? fetchRivalRanking(self!.userId, chart, LATEST_VERSION) : fetchGlobalRanking(self!.userId, chart, LATEST_VERSION),
  );

  const rows = self && data ? rankWithSelf(data.rows, self, exScore, bpi) : [];
  const selfIndex = rows.findIndex((r) => r.isSelf);
  const total = scope === "global" && data?.totalCount ? Math.max(data.totalCount, rows.length) : rows.length;

  // 一覧が出たとき（と、スコアの修正で自分の位置が動いたとき）、自分を中央に持ってくる
  useEffect(() => {
    if (selfIndex < 0) return;
    const t = setTimeout(() => listRef.current?.scrollToRow({ align: "center", index: selfIndex }), 50);
    return () => clearTimeout(t);
  }, [selfIndex, rows.length, scope, listRef]);

  if (!self) return <SignInPrompt text="BPIM2 にサインインすると、ライバルやグローバルの順位が見られます。" />;

  return (
    <div className="flex h-full flex-col gap-2">
      <div role="radiogroup" aria-label="順位の範囲" className="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-secondary p-1">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scope === s.id}
            onClick={() => setScope(s.id)}
            className={cn("rounded-sm py-1.5 text-sm transition-colors", scope === s.id ? "bg-card font-medium text-foreground" : "text-muted-foreground")}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Message>読み込んでいます</Message>
      ) : !data ? (
        <Message>順位を取得できませんでした</Message>
      ) : (
        <>
          <p className="shrink-0 px-1 text-sm">
            いまのスコアで <span className="text-lg font-semibold tabular-nums">{rows[selfIndex]?.rank}位</span>
            <span className="text-muted-foreground tabular-nums"> / {total}人</span>
            {scope === "rival" && rows.length <= 1 && <span className="ml-2 text-xs text-muted-foreground">フォロー中のライバルに記録がありません</span>}
          </p>
          <div className="relative min-h-0 flex-1">
            <List
              listRef={listRef}
              rowCount={rows.length}
              rowHeight={ROW_HEIGHT}
              rowComponent={RankingRow}
              rowProps={{ rows, selfEx: exScore }}
              style={{ position: "absolute", inset: 0 }}
              className="overscroll-contain"
            />
          </div>
        </>
      )}
    </div>
  );
}
