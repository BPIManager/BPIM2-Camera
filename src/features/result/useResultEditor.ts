import { useEffect, useMemo, useState } from "react";
import { fetchBpi, type BpiOutcome } from "@/lib/bpi/client";
import { initialBpiStatus, isExScoreInRange } from "@/lib/domain/score";
import type { ChartRef, ClearType, ResultRecord } from "@/lib/domain/types";
import { toChartRef } from "@/lib/recognition/resolve";
import type { SongMasterEntry } from "@/lib/songs/types";
import type { Draft } from "./draft";

/** 手で入力する数。FAST・SLOW は、読み取りを作るまで学習用に写真を集めるだけにする */
export type CountKey = "missCount";

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
  // 使用オプション。読み取りは結果を出したあとに届く（draft が更新される）ので、手で選ぶまでは読み取りの値に従う。
  // 正規（OFF）のときは USE OPTION の表示自体が出ないので、読めなかったときは OFF とする
  const [optionPick, setOptionPick] = useState<{ value: string } | null>(null);
  const readOption = draft.raw?.useOption ?? "OFF";
  const useOption = optionPick ? optionPick.value : readOption;
  // クリアランプ（読み取り、または手で選んだもの）。読めなければ null（未選択）
  const [clearTypePick, setClearTypePick] = useState<{ value: ClearType | null } | null>(null);
  const readClearType = draft.raw?.clearType ?? null;
  const clearType = clearTypePick ? clearTypePick.value : readClearType;
  // ミスカウント（いまは読み取れないので、手で入力する。入力した値は学習サンプルの正解にもなる）
  const [counts, setCounts] = useState<Record<CountKey, string>>({ missCount: draft.raw?.missCount?.toString() ?? "" });
  const num = (t: string) => (t === "" ? null : Number(t));
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
    if (optionPick && optionPick.value !== readOption) fields.push("useOption");
    if (clearTypePick && clearTypePick.value !== readClearType) fields.push("clearType");
    return fields;
  }, [chart, exScore, draft.resolution, readOption, optionPick, readClearType, clearTypePick]);

  const record: ResultRecord | null =
    chart && valid && exScore !== null
      ? {
          id: draft.id,
          createdAt: Date.now(),
          chart,
          exScore,
          bestExScore: draft.raw?.bestExScore ?? null,
          judge: draft.raw?.judge ?? null,
          missCount: num(counts.missCount),
          fast: null,
          slow: null,
          bestMissCount: draft.raw?.bestMissCount ?? null,
          clearType,
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
    /** 使用オプション（読み取り、または手で選んだもの）。読めなければ OFF */
    useOption,
    setUseOption: (value: string) => setOptionPick({ value }),
    /** クリアランプ（読み取り、または手で選んだもの）。読めず、選んでもいなければ null */
    clearType,
    setClearType: (value: ClearType | null) => setClearTypePick({ value }),
    /** ミスカウントの入力（数字の文字列） */
    counts,
    setCount: (key: CountKey, text: string) => setCounts((c) => ({ ...c, [key]: text.replace(/\D/g, "").slice(0, 4) })),
    record,
    /** チャート用の BPI 曲線・アリーナ平均。まだなら null */
    outcome: chartOutcome,
    /** スコアや曲を変えて、BPI を再計算している間は true */
    bpiLoading,
    valid,
  };
}
