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
  const [res, setRes] = useState<{ key: string; songId: number; outcome: BpiOutcome } | null>(null);
  // 読み取れなかったときは最初から手入力にする。「空のときだけ入力欄を出す」にすると、
  // 1 文字目を打った時点で入力欄が消え、キーボードが閉じてしまう
  const [manualEx, setManualEx] = useState(draft.resolution?.exScore == null);
  const showManualEx = manualEx;

  const exScore = exText === "" ? null : Number(exText);
  // 使用オプション。読み取りは結果を出したあとに届く（draft が更新される）ので、手で選ぶまでは読み取りの値に従う
  const [optionPick, setOptionPick] = useState<{ value: string | null } | null>(null);
  const useOption = optionPick ? optionPick.value : (draft.raw?.useOption ?? null);
  const valid = chart !== null && exScore !== null && isExScoreInRange(exScore, chart.notes);

  const unsupported = chart !== null && initialBpiStatus(chart.level) === "unsupported-level";
  /** BPI を求める対象（曲とスコアの組）。☆10 以下は API を呼ばない */
  const bpiKey = chart && valid && exScore !== null && !unsupported ? `${chart.songId}:${exScore}` : null;

  useEffect(() => {
    if (!chart || bpiKey === null || exScore === null) return;
    let alive = true;
    fetchBpi({ chart, exScore, version }).then((outcome) => alive && setRes({ key: bpiKey, songId: chart.songId, outcome }));
    return () => {
      alive = false;
    };
    // bpiKey が同じなら呼び直さない（chart などの参照が変わっても、曲とスコアが同じなら再計算しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpiKey, version]);

  // いまの曲・スコアに対する BPI。再計算が済むまでは null（古いスコアの BPI を出さない）
  const bpi: BpiOutcome | null = unsupported ? { status: "unsupported-level", bpi: null, estimatedRank: null } : res && res.key === bpiKey ? res.outcome : null;
  /** チャート用（BPI 曲線・アリーナ平均）。スコアが変わっても曲が同じなら前の結果をそのまま使う */
  const chartOutcome: BpiOutcome | null = chart && res && res.songId === chart.songId ? res.outcome : null;
  const bpiLoading = bpiKey !== null && bpi === null;

  const corrected = useMemo(() => {
    const fields: string[] = [];
    if (chart && chart.songId !== draft.resolution?.chart?.songId) fields.push("song");
    if (exScore !== (draft.resolution?.exScore ?? null)) fields.push("exScore");
    if (optionPick && optionPick.value !== (draft.raw?.useOption ?? null)) fields.push("useOption");
    return fields;
  }, [chart, exScore, draft.resolution, draft.raw, optionPick]);

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
          useOption,
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
    showManualEx,
    startManualEx: () => {
      setExText("");
      setManualEx(true);
    },
    /** 使用オプション（読み取り、または手で選んだもの）。分からなければ null */
    useOption,
    setUseOption: (value: string | null) => setOptionPick({ value }),
    record,
    /** チャート用の BPI 曲線・アリーナ平均。まだなら null */
    outcome: chartOutcome,
    /** スコアや曲を変えて、BPI を再計算している間は true */
    bpiLoading,
    valid,
  };
}
