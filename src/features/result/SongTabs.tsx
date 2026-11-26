import { useState } from "react";
import Skeleton from "@/components/ui/skeleton";
import { useRemote } from "@/hooks/useRemote";
import { REFERENCE_VERSION, type BpiOutcome } from "@/lib/bpi/client";
import { ARENA_RANKS, REF_STORAGE_KEY, defaultRefChoice, isRefChoice, refLineFor } from "@/lib/bpi/refLine";
import { fetchRivalRanking, type HistoryEntry, type SelfInfo } from "@/lib/bpi/songData";
import type { ResultRecord } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import BpiChart from "./BpiChart";
import HistoryPanel from "./HistoryPanel";
import RankingPanel from "./RankingPanel";

type Tab = "chart" | "history" | "ranking";

const TABS: { id: Tab; label: string }[] = [
  { id: "chart", label: "チャート" },
  { id: "history", label: "履歴" },
  { id: "ranking", label: "ランキング" },
];

interface Props {
  record: ResultRecord;
  /** BPI 計算の結果（曲線・アリーナ平均を含む）。まだなら null */
  outcome: BpiOutcome | null;
  /** 未サインインなら null */
  self: SelfInfo | null;
  history: { data: HistoryEntry[] | null; loading: boolean };
  best: number | null;
  /** 自分のアリーナランク。チャートの参照線の既定に使う */
  arenaRank: string | null;
}

/**
 * 曲が確定したときの、チャート・履歴・ランキングの 3 タブ。
 * 残りの高さいっぱいに広がり、タブの中身だけがスクロールする（シート全体はスクロールしない）
 */
export default function SongTabs({ record, outcome, self, history, best, arenaRank }: Props) {
  const [tab, setTab] = useState<Tab>("chart");
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="曲の詳細" className="grid shrink-0 grid-cols-3 border-b border-border px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 py-2 text-sm transition-colors",
              tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className={cn("relative min-h-0 flex-1 px-3 pt-2", tab === "chart" && "overflow-y-auto overscroll-contain")}
      >
        {tab === "chart" && <ChartTab record={record} outcome={outcome} best={best} self={self} arenaRank={arenaRank} />}
        {tab === "history" && <HistoryPanel signedIn={self !== null} history={history} />}
        {tab === "ranking" && <RankingPanel self={self} chart={record.chart} exScore={record.exScore} bpi={record.bpi} />}
      </div>
    </section>
  );
}

const readSavedRef = () => {
  try {
    return localStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
};

function ChartTab({ record, outcome, best, self, arenaRank }: { record: ResultRecord; outcome: BpiOutcome | null; best: number | null; self: SelfInfo | null; arenaRank: string | null }) {
  const [saved, setSaved] = useState(readSavedRef);
  const choice = defaultRefChoice(saved, arenaRank, outcome?.arenaAverages);
  const needsRivals = choice === "rival-avg" || choice === "rival-top";
  const rivals = useRemote(self && needsRivals ? `rival:${self.userId}:${record.chart.songId}` : null, () => fetchRivalRanking(self!.userId, record.chart, REFERENCE_VERSION));
  const rivalScores = rivals.data ? rivals.data.rows.filter((r) => r.userId !== self?.userId && r.exScore !== null).map((r) => r.exScore as number) : null;
  const refLine = refLineFor(choice, { arenaAverages: outcome?.arenaAverages, best, rivalScores });

  const message = (text: string) => <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
  if (record.bpiStatus === "unsupported-level") return message("BPI のチャートは、☆11・☆12 の曲で表示されます");
  if (!outcome) return <Skeleton className="h-48 w-full" />;
  if (!outcome.curve || outcome.curve.length === 0) return message("この曲のチャートを取得できませんでした");

  const options = [
    { value: "none", label: "非表示" },
    ...ARENA_RANKS.map((r) => ({ value: r, label: `${r}平均`, disabled: !outcome.arenaAverages?.[r] })),
    { value: "rival-avg", label: "ライバル平均", disabled: self === null },
    { value: "rival-top", label: "ライバルトップ", disabled: self === null },
    { value: "personal-best", label: "自己歴代", disabled: best === null },
  ];
  const status = choice !== "none" && refLine === null ? (needsRivals && rivals.loading ? "読み込み中" : "データなし") : null;

  return (
    // 領域の高さいっぱいにチャートを広げる（短いときは、最低限の高さを保って、パネルの中でスクロールさせる）
    <div className="flex h-full min-h-64 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {status ?? "参照線"}
          <select
            value={choice}
            onChange={(e) => {
              const v = e.target.value;
              if (!isRefChoice(v)) return;
              setSaved(v);
              try {
                localStorage.setItem(REF_STORAGE_KEY, v);
              } catch {
                /* 保存できなくても、この画面では切り替わる */
              }
            }}
            className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1">
        <BpiChart curve={outcome.curve} exScore={record.exScore} maxScore={record.chart.notes * 2} refLine={refLine} />
      </div>
    </div>
  );
}
