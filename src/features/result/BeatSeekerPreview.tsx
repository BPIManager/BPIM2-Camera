import { useBeatSeekerLink } from "@/hooks/useBeatSeekerLink";
import { useRemote } from "@/hooks/useRemote";
import { consistentJudge, previewBeatSeekerScore, type BeatSeekerPlay, type BeatSeekerPreview as Preview, type PreviewResult } from "@/lib/beatSeeker/client";
import type { SyncTarget } from "@/lib/bpi/syncTarget";
import type { ResultRecord } from "@/lib/domain/types";

/** 入力を直している間は呼ばない（回数制限は、プレビュー・登録・取り消しの合計で 10 分に 120 回） */
const DEBOUNCE_MS = 800;

const num = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });

/** PT の書式（小数第 2 位まで。分からなければ —） */
export const formatPt = (v: number | null) => (v === null ? "—" : num.format(v));

/** 差の書式（+12.5・−3・±0） */
export const formatDelta = (v: number) => (v > 0 ? `+${num.format(v)}` : v < 0 ? `−${num.format(-v)}` : "±0");

/** プレビューに送る内容。ランプが分からなければ null */
function playOf(record: ResultRecord): BeatSeekerPlay | null {
  if (record.clearType === null || record.clearType === "NO PLAY") return null;
  return {
    title: record.chart.title,
    difficulty: record.chart.difficulty,
    exScore: record.exScore,
    judge: consistentJudge(record.judge, record.exScore, record.chart.notes),
    clearType: record.clearType,
    missCount: record.missCount,
  };
}

/** beat-seeker のプレビューの状態。結果画面の数値の欄と、詳細の両方が使う（取得は 1 回） */
export type BeatSeekerPreviewState =
  /** 連携していない */
  | { kind: "off" }
  /** DP・INFINITAS など、beat-seeker に登録できないスコア */
  | { kind: "unsupported" }
  /** クリアランプが分からない（beat-seeker は必須） */
  | { kind: "need-lamp" }
  | { kind: "loading" }
  | { kind: "failed"; result: Exclude<PreviewResult, { kind: "ok" }> | null }
  | { kind: "ok"; preview: Preview };

/**
 * beat-seeker に登録した場合の変動幅を取る（保存しない）。連携していて、SP の最新バージョンで、ランプが分かるときだけ呼ぶ。
 * 返ってきた値は、本人への表示だけに使う（保存・再配布・学習データへの混入はしない）
 */
export function useBeatSeekerPreview(record: ResultRecord | null, syncTarget: SyncTarget): BeatSeekerPreviewState {
  const link = useBeatSeekerLink();
  const supported = record !== null && record.chart.playStyle === "SP" && syncTarget === "latest";
  const play = link && supported ? playOf(record) : null;
  const key = play ? `beat-seeker-preview:${JSON.stringify(play)}` : null;
  const result = useRemote<PreviewResult>(key, () => previewBeatSeekerScore(link!.token, play!), DEBOUNCE_MS);

  if (!link || !record) return { kind: "off" };
  if (!supported) return { kind: "unsupported" };
  if (!play) return { kind: "need-lamp" };
  if (result.loading) return { kind: "loading" };
  if (!result.data) return { kind: "failed", result: null };
  return result.data.kind === "ok" ? { kind: "ok", preview: result.data.preview } : { kind: "failed", result: result.data };
}

/** 数値の欄に出す、この楽曲の新しい PT。☆11 以上は BEAT-PT、☆10 以下は Rate-PT（その譜面が対象外なら、もう一方）。どちらも対象外なら null */
export function headlinePt(preview: Preview, level: number): { label: "BEAT-PT" | "Rate-PT"; value: number; totalDelta: number | null } | null {
  const beat = preview.beatPt.chart?.after != null ? { label: "BEAT-PT" as const, value: preview.beatPt.chart.after, totalDelta: preview.beatPt.total.delta } : null;
  const rate = preview.ratePt.chart?.after != null ? { label: "Rate-PT" as const, value: preview.ratePt.chart.after, totalDelta: preview.ratePt.total.delta } : null;
  return (level >= 11 ? (beat ?? rate) : (rate ?? beat)) ?? null;
}


