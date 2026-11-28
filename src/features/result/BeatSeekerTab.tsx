import { useEffect, useState } from "react";
import Skeleton from "@/components/ui/skeleton";
import type {
  BeatSeekerPreview,
  PreviewResult,
  PtChange,
} from "@/lib/beatSeeker/client";
import {
  BEAT_TIERS,
  RATE_TIERS,
  compactTierChange,
  locate,
  roman,
  type TierTable,
} from "@/lib/beatSeeker/tiers";
import { cn } from "@/lib/utils";
import {
  formatDelta,
  formatPt,
  type BeatSeekerPreviewState,
} from "./BeatSeekerPreview";

/** しきい値の表記。1,000 以上は整数、それ未満は小数第 1 位まで（Rate-Tier の 459.5 など） */
const thresholdText = (v: number) =>
  v >= 1000
    ? Math.round(v).toLocaleString("ja-JP")
    : String(Math.round(v * 10) / 10);

/** 帯の中での位置（0〜100%）。範囲の外は端に寄せる */
const pct = (v: number, floor: number, ceil: number) =>
  Math.min(100, Math.max(0, ((v - floor) / (ceil - floor)) * 100));

/** ティア名（「Master II」）の中のスペースでは、折り返さない（「Ancient / I」と分かれないように）。「 → 」の前後では折り返してよい */
const keepTogether = (text: string) =>
  text
    .split(" → ")
    .map((part) => part.replace(/ /g, " "))
    .join(" → ");


/** タップ（マウスなら乗せる）で説明を出す。画面のほかの場所をタップすると閉じる */
function Hint({ text, children }: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // この要素のタップはトグル側で扱うので、閉じる処理は、次の周期から付ける
    const t = setTimeout(() => document.addEventListener("pointerdown", close, { once: true }), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={text}
      className="relative cursor-help"
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((v) => !v))}
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      {children}
      {open && (
        <p role="tooltip" className="pointer-events-none absolute right-0 bottom-full left-0 z-10 mb-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] leading-snug text-foreground shadow-lg">
          {text}
        </p>
      )}
    </div>
  );
}

/** ゲージの説明。いまのティアの範囲・色・線の意味 */
const gaugeHint = (pos: ReturnType<typeof locate>, before: number | null) =>
  `${pos.tier.name} の範囲（${thresholdText(pos.bandFloor)}〜${pos.bandCeil === null ? "上限なし" : thresholdText(pos.bandCeil)}）の中での位置です。${before === null ? "" : "水色は登録前、"}緑は今回で伸びる分、太い線は登録後、細い線は登録前の位置です。I〜V は段の下限です。`;

/** 帯（いまのティアの範囲）のゲージ。段の目盛り（I〜V）・前のスコア・登録後のスコアを出す */
function Gauge({
  table,
  before,
  after,
}: {
  table: TierTable;
  before: number | null;
  after: number;
}) {
  const pos = locate(table, after);
  const { tier, bandFloor, bandCeil } = pos;
  // 最上位のティア（Legend）は上限がない。帯いっぱいに満たして出す
  const top = bandCeil === null;
  const ceil = bandCeil ?? bandFloor + 1;
  const stayed =
    before !== null &&
    before >= bandFloor &&
    (bandCeil === null || before < bandCeil);
  const fillTo = top ? 100 : pct(after, bandFloor, ceil);
  const beforeAt = stayed ? pct(before, bandFloor, ceil) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-4 rounded-full bg-muted">
        {/* 前のスコアまで（同じ帯のとき）と、今回で伸びた分。帯が上がったときは、帯の下限からすべて「伸びた分」 */}
        <div
          className="absolute inset-y-0 left-0 rounded-l-full bg-primary/70"
          style={{ width: `${beforeAt}%` }}
        />
        <div
          className="absolute inset-y-0 bg-success"
          style={{
            left: `${beforeAt}%`,
            width: `${Math.max(0, fillTo - beforeAt)}%`,
          }}
        />
        {tier.steps.slice(1).map((at) => (
          <span
            key={at}
            className="absolute inset-y-1 w-px bg-background/80"
            style={{ left: `${pct(at, bandFloor, ceil)}%` }}
            aria-hidden
          />
        ))}
        {stayed && before !== after && (
          <span
            className="absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-foreground/60"
            style={{ left: `${beforeAt}%` }}
            aria-hidden
          />
        )}
        <span
          className="absolute -top-1 -bottom-1 w-1.5 -translate-x-1/2 rounded bg-foreground"
          style={{ left: `${fillTo}%` }}
          aria-hidden
        />
      </div>
      {/* 段の数字（I〜V）は、その段の下限の位置に出す */}
      <div className="relative h-3.5 text-[11px] leading-[14px] text-muted-foreground">
        {tier.steps.map((at, i) => (
          <span
            key={at}
            className="absolute top-0 -translate-x-1/2 tabular-nums"
            style={{ left: `${pct(at, bandFloor, ceil) + (i === 0 ? 3 : 0)}%` }}
          >
            {roman(i + 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 全ティアの並び。いまのティアを目立たせ、越えたティアを濃くする */
function TierStrip({ table, pt }: { table: TierTable; pt: number }) {
  const { tierIndex, tier } = locate(table, pt);
  return (
    <div
      className="flex items-end gap-0.5"
      role="img"
      aria-label={`ティアの位置（${tier.name}）`}
    >
      {table.tiers.map((t, i) => (
        <span
          key={t.name}
          title={t.name}
          className={cn(
            "flex-1 rounded-sm",
            i < tierIndex
              ? "h-2 bg-primary/50"
              : i === tierIndex
                ? "h-4 bg-success"
                : "h-2 bg-muted",
          )}
        />
      ))}
    </div>
  );
}

/**
 * ティアのカード 1 枚（2 枚を縦に並べ、タブの高さを半分ずつ使う。1 枚は約 150px で収まる）。横いっぱいに広げる。
 * 上から、見出し・この譜面の PT（前 → 後）・総合 PT の差 / ティアの変動（左）とあと何 PT か（右）/ 前 → 後の PT（左）と次の段（右）/ ゲージ / 全ティアの並び。
 * この譜面の PT は、上の 3 つの数字には、BEAT-PT か Rate-PT の片方（新しい値）しか出ないので、ここに両方の前 → 後を出す
 */
function TierCard({
  table,
  title,
  chart,
  total,
  tier,
}: {
  table: TierTable;
  title: string;
  chart: PtChange["chart"];
  total: PtChange["total"];
  tier: PtChange["tier"];
}) {
  const pt = total.after ?? total.before;
  const pos = pt === null ? null : locate(table, pt);
  const delta = total.delta;
  const tierText =
    compactTierChange(tier.before, tier.after) ?? pos?.label ?? "—";
  const up =
    tier.before !== null && tier.after !== null && tier.before !== tier.after;
  const remaining = pos?.next && pos.remaining !== null ? pos : null;
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-1.5 rounded-md border border-border p-2.5"
      aria-label={title}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="shrink-0 text-xs font-medium text-muted-foreground">
          {title}
        </h3>
        {/* この譜面 1 曲の PT（前 → 後）。対象外の譜面（BEAT-PT は HYPER ☆11 以上、Rate-PT は ANOTHER・LEGGENDARIA 以外）は出さない */}
        {chart && (
          <span
            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground tabular-nums"
            title="この譜面の PT"
          >
            単曲 {formatPt(chart.before)} →{" "}
            <span
              className={cn(
                chart.before !== null &&
                  chart.after !== null &&
                  chart.after > chart.before &&
                  "text-success",
              )}
            >
              {formatPt(chart.after)}
            </span>
          </span>
        )}
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            delta !== null && delta > 0
              ? "text-success"
              : "text-muted-foreground",
          )}
        >
          {delta === null ? "—" : `${formatDelta(delta)} pt`}
        </span>
      </header>
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={cn(
            "min-w-0 text-base leading-tight font-bold",
            up && "text-success",
          )}
        >
          {keepTogether(tierText)}
        </p>
        <p className="shrink-0 text-base leading-tight font-semibold tabular-nums">
          {remaining ? (
            <>
              あと {formatPt(remaining.remaining)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                pt
              </span>
            </>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">
              最上位のティア
            </span>
          )}
        </p>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-xs leading-none text-muted-foreground tabular-nums">
        <span>
          {formatPt(total.before)} →{" "}
          <span className={cn(delta !== null && delta > 0 && "text-success")}>
            {formatPt(total.after)}
          </span>
        </span>
        {remaining?.next && (
          <span className="text-[11px]">
            次の {keepTogether(remaining.next.label)}（
            {thresholdText(remaining.next.at)}）
          </span>
        )}
      </div>
      {pt !== null && pos && (
        <Hint text={gaugeHint(pos, total.before)}>
          <Gauge table={table} before={total.before} after={pt} />
        </Hint>
      )}
      {pt !== null && pos && (
        <Hint text={`全 ${table.tiers.length} ティアの位置です。緑が現在のティア（${pos.tier.name}）、濃い水色が越えたティア、灰色がこれからのティアです。`}>
          <TierStrip table={table} pt={pt} />
        </Hint>
      )}
    </section>
  );
}

function Failure({
  result,
}: {
  result: Exclude<PreviewResult, { kind: "ok" }> | null;
}) {
  const text =
    result === null
      ? "beat-seeker に接続できませんでした"
      : result.kind === "invalid"
        ? "トークンが無効です。設定の「アカウント連携 › beat-seeker」で貼り直してください"
        : result.kind === "rate-limited"
          ? "回数制限に達しました。少し待ってから、もう一度お試しください"
          : result.kind === "rejected" && result.code === "CHART_NOT_FOUND"
            ? "この譜面は beat-seeker の楽曲に見つかりませんでした（曲名の表記が違う可能性があります）"
            : result.message;
  return <p className="py-4 text-center text-sm text-warning">{text}</p>;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function Loaded({ preview }: { preview: BeatSeekerPreview }) {
  const { beatPt, ratePt, willUpdate } = preview;
  return (
    // タブの高さいっぱいに広げる（足りないときは、中身の最低限の高さでスクロールさせる）
    <div className="flex h-full min-h-72 flex-col gap-2 pb-2">
      {/* BEAT-TIER と Rate-Tier は、縦に 2 段。タブの高さを半分ずつ使う */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <TierCard
          table={BEAT_TIERS}
          title="BEAT-TIER"
          chart={beatPt.chart}
          total={beatPt.total}
          tier={beatPt.tier}
        />
        <TierCard
          table={RATE_TIERS}
          title="Rate-Tier"
          chart={ratePt.chart}
          total={ratePt.total}
          tier={ratePt.tier}
        />
      </div>
      {!willUpdate && (
        <p className="shrink-0 text-xs text-muted-foreground">
          記録が伸びないため、登録しても変わりません
        </p>
      )}
    </div>
  );
}

/**
 * beat-seeker のタブ。登録した場合の、BEAT-TIER・Rate-Tier の変動のゲージ（保存しない）。
 * この譜面の PT と総合 PT の差は、上の数字の欄に出しているので、ここでは出さない。返ってきた値は、本人への表示だけに使う
 */
export default function BeatSeekerTab({
  state,
}: {
  state: BeatSeekerPreviewState;
}) {
  switch (state.kind) {
    case "off":
      return (
        <Message>
          設定の「アカウント連携 ›
          beat-seeker」で連携すると、BEAT-PT・ティアの変動をここで確かめられます
        </Message>
      );
    case "unsupported":
      return (
        <Message>
          SP の最新バージョンのスコアだけ、beat-seeker に登録できます
        </Message>
      );
    case "need-lamp":
      return (
        <Message>
          クリアランプを選ぶと、BEAT-PT・ティアの変動を確かめられます
        </Message>
      );
    case "loading":
      return (
        <div
          className="flex h-full min-h-60 flex-col gap-2 pb-2"
          aria-label="beat-seeker で変動を確かめています"
        >
          <Skeleton className="h-full w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      );
    case "failed":
      return <Failure result={state.result} />;
    case "ok":
      return <Loaded preview={state.preview} />;
  }
}
