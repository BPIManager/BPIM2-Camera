import { useEffect, useMemo, useState } from "react";
import { fetchBpi, type BpiOutcome } from "@/lib/bpi/client";
import { initialBpiStatus, isExScoreInRange } from "@/lib/domain/score";
import type { ChartRef, ResultRecord } from "@/lib/domain/types";
import { toChartRef } from "@/lib/recognition/resolve";
import type { SongMasterEntry } from "@/lib/songs/types";
import type { Draft } from "./draft";

/** ドロワー内の編集状態。曲か EX が変わるたびに BPI を再計算する（☆10以下は呼ばない） */
export function useResultEditor(draft: Draft, version: string) {
  const [chart, setChart] = useState<ChartRef | null>(draft.resolution?.chart ?? null);
  const [exText, setExText] = useState(draft.resolution?.exScore?.toString() ?? "");
  const [bpi, setBpi] = useState<BpiOutcome | null>(null);

  const exScore = exText === "" ? null : Number(exText);
  const valid = chart !== null && exScore !== null && isExScoreInRange(exScore, chart.notes);

  useEffect(() => {
    if (!chart || !valid || exScore === null) {
      setBpi(null);
      return;
    }
    if (initialBpiStatus(chart.level) === "unsupported-level") {
      setBpi({ status: "unsupported-level", bpi: null, estimatedRank: null });
      return;
    }
    let alive = true;
    setBpi(null);
    fetchBpi({ chart, exScore, version }).then((o) => alive && setBpi(o));
    return () => {
      alive = false;
    };
  }, [chart, exScore, valid, version]);

  const corrected = useMemo(() => {
    const fields: string[] = [];
    if (chart && chart.songId !== draft.resolution?.chart?.songId) fields.push("song");
    if (exScore !== (draft.resolution?.exScore ?? null)) fields.push("exScore");
    return fields;
  }, [chart, exScore, draft.resolution]);

  const record: ResultRecord | null =
    chart && valid && exScore !== null
      ? {
          id: draft.id,
          createdAt: Date.now(),
          chart,
          exScore,
          bestExScore: draft.raw?.bestExScore ?? null,
          judge: draft.raw?.judge ?? null,
          missCount: draft.raw?.missCount ?? null,
          bestMissCount: draft.raw?.bestMissCount ?? null,
          clearType: draft.raw?.clearType ?? null,
          bestClearType: draft.raw?.bestClearType ?? null,
          djLevel: draft.raw?.djLevel ?? null,
          useOption: draft.raw?.useOption ?? null,
          bpi: bpi?.bpi ?? null,
          bpiStatus: bpi?.status ?? initialBpiStatus(chart.level),
          estimatedRank: bpi?.estimatedRank ?? null,
          source: draft.source,
          correctedFields: corrected,
          imageKey: draft.id,
        }
      : null;

  return {
    chart,
    pickSong: (e: SongMasterEntry) => setChart(toChartRef(e)),
    exText,
    setExText,
    record,
    valid,
  };
}
