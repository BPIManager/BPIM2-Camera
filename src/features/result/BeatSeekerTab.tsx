import Skeleton from "@/components/ui/skeleton";
import type { BeatSeekerPreview, PreviewResult, PtChange } from "@/lib/beatSeeker/client";
import { BEAT_TIERS, RATE_TIERS, locate, roman, type TierTable } from "@/lib/beatSeeker/tiers";
import { cn } from "@/lib/utils";
import { formatDelta, formatPt, type BeatSeekerPreviewState } from "./BeatSeekerPreview";

/** しきい値の表記。1,000 以上は整数、それ未満は小数第 1 位まで（Rate-Tier の 459.5 など） */
const thresholdText = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString("ja-JP") : String(Math.round(v * 10) / 10));

/** 帯の中での位置（0〜100%）。範囲の外は端に寄せる */
const pct = (v: number, floor: number, ceil: number) => Math.min(100, Math.max(0, ((v - floor) / (ceil - floor)) * 100));

/** 帯（いまのティアの範囲）のゲージ。段の目盛り・前のスコア・登録後のスコアを出す */
function Gauge({ table, before, after }: { table: TierTable; before: number | null; after: number }) {
  const pos = locate(table, after);
  const { tier, bandFloor, bandCeil } = pos;
  // 最上位のティア（Legend）は上限がない。帯いっぱいに満たして出す
  const top = bandCeil === null;
  const ceil = bandCeil ?? bandFloor + 1;
  const stayed = before !== null && before >= bandFloor && (bandCeil === null || before < bandCeil);
  const fillTo = top ? 100 : pct(after, bandFloor, ceil);
  const beforeAt = stayed ? pct(before, bandFloor, ceil) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-3 rounded-full bg-muted">
        {/* 前のスコアまで（同じ帯のとき）と、今回で伸びた分。帯が上がったときは、帯の下限からすべて「伸びた分」 */}
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-primary/70" style={{ width: `${stayed ? beforeAt : 0}%` }} />
        <div className="absolute inset-y-0 bg-success" style={{ left: `${stayed ? beforeAt : 0}%`, width: `${Math.max(0, fillTo - (stayed ? beforeAt : 0))}%` }} />
        {tier.steps.slice(1).map((at) => (
          <span key={at} className="absolute inset-y-0.5 w-px bg-background/80" style={{ left: `${pct(at, bandFloor, ceil)}%` }} aria-hidden />
        ))}
        {stayed && before !== after && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded bg-foreground/60" style={{ left: `${beforeAt}%` }} aria-hidden />}
        <span className="absolute -top-1 -bottom-1 w-1 -translate-x-1/2 rounded bg-foreground" style={{ left: `${fillTo}%` }} aria-hidden />
      </div>
      {/* 段の数字（I〜V）は、その段の下限の位置に出す */}
      <div className="relative h-3.5 text-[10px] leading-none text-muted-foreground">
        {tier.steps.map((at, i) => (
          <span key={at} className="absolute top-0 -translate-x-1/2 tabular-nums" style={{ left: `${pct(at, bandFloor, ceil) + (i === 0 ? 2.5 : 0)}%` }}>
            {roman(i + 1)}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[10px] leading-none text-muted-foreground tabular-nums">
        <span>{thresholdText(bandFloor)}</span>
        <span>{bandCeil === null ? "" : thresholdText(bandCeil)}</span>
      </div>
    </div>
  );
}

/** 全ティアの並び。いまのティアを目立たせ、越えたティアを濃くする */
function TierStrip({ table, pt }: { table: TierTable; pt: number }) {
  const { tierIndex } = locate(table, pt);
  return (
    <div className="flex items-end gap-0.5" role="img" aria-label={`ティアの位置（${locate(table, pt).tier.name}）`}>
      {table.tiers.map((t, i) => (
        <span
          key={t.name}
          title={t.name}
          className={cn("flex-1 rounded-sm", i < tierIndex ? "h-1.5 bg-primary/50" : i === tierIndex ? "h-3 bg-success" : "h-1.5 bg-muted")}
        />
      ))}
    </div>
  );
}

/** ティアのカード 1 枚。見出し・ティアの変動・ゲージ・次の段までの残り・全ティアの並び */
function TierCard({ table, title, total, tier }: { table: TierTable; title: string; total: PtChange["total"]; tier: PtChange["tier"] }) {
  const pt = total.after ?? total.before;
  const tierChanged = tier.before !== null && tier.after !== null && tier.before !== tier.after;
  const pos = pt === null ? null : locate(table, pt);
  const delta = total.delta;
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3" aria-label={title}>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <span className={cn("text-sm font-semibold tabular-nums", delta !== null && delta > 0 ? "text-success" : "text-muted-foreground")}>
          {delta === null ? "—" : formatDelta(delta)} pt
        </span>
      </header>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        {tierChanged ? (
          <>
            <span className="text-muted-foreground">{tier.before}</span>
            <span aria-hidden>→</span>
            <span className="font-semibold text-success">{tier.after}</span>
            <span className="text-xs text-success">ティアアップ</span>
          </>
        ) : (
          <span className="font-semibold">{tier.after ?? tier.before ?? pos?.label ?? "—"}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {formatPt(total.before)} → <span className={cn(delta !== null && delta > 0 && "text-success")}>{formatPt(total.after)}</span>
        </span>
      </p>
      {pt !== null && <Gauge table={table} before={total.before} after={pt} />}
      {pos !== null && pt !== null && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {pos.next && pos.remaining !== null ? (
            <>
              次の <span className="font-medium text-foreground">{pos.next.label}</span> まで あと <span className="font-medium text-foreground">{formatPt(pos.remaining)}</span> pt（{thresholdText(pos.next.at)}）
            </>
          ) : (
            "最上位のティアです"
          )}
        </p>
      )}
      {pt !== null && <TierStrip table={table} pt={pt} />}
    </section>
  );
}

/** 変動の 1 行（前 → 後）。変わらなければ値だけ */
function ChangeRow({ label, before, after }: { label: string; before: number | null; after: number | null }) {
  const changed = before !== null && after !== null && before !== after;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums">
        {changed ? (
          <>
            {formatPt(before)} → <span className="font-medium text-success">{formatPt(after)}</span>
          </>
        ) : (
          formatPt(after ?? before)
        )}
      </dd>
    </div>
  );
}

function Failure({ result }: { result: Exclude<PreviewResult, { kind: "ok" }> | null }) {
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
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Loaded({ preview }: { preview: BeatSeekerPreview }) {
  const { beatPt, ratePt, chart, willUpdate } = preview;
  const delta = beatPt.total.delta;
  return (
    <div className="flex flex-col gap-3 pb-3">
      {/* 右上：総合 BEAT-PT の変動 */}
      <header className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          登録した場合の変動です（まだ登録されません）
          {chart.unofficialLevel && <span className="block tabular-nums">非公式難易度 {chart.unofficialLevel}</span>}
        </p>
        <div className="shrink-0 text-right">
          <div className="text-[10px] leading-none text-muted-foreground">BEAT-PT</div>
          <div className={cn("text-xl leading-tight font-semibold tabular-nums", delta !== null && delta > 0 ? "text-success" : "text-muted-foreground")}>{delta === null ? "—" : formatDelta(delta)}</div>
        </div>
      </header>
      {!willUpdate && <p className="text-xs text-muted-foreground">記録が伸びないため、登録しても変わりません</p>}
      <TierCard table={BEAT_TIERS} title="BEAT-TIER" total={beatPt.total} tier={beatPt.tier} />
      <TierCard table={RATE_TIERS} title="Rate-Tier" total={ratePt.total} tier={ratePt.tier} />
      {(beatPt.chart || ratePt.chart) && (
        <dl className="flex flex-col gap-1 rounded-md border border-border p-3 text-xs">
          <dt className="sr-only">この譜面</dt>
          {beatPt.chart && <ChangeRow label="BEAT-PT（この譜面）" before={beatPt.chart.before} after={beatPt.chart.after} />}
          {ratePt.chart && <ChangeRow label="Rate-PT（この譜面）" before={ratePt.chart.before} after={ratePt.chart.after} />}
        </dl>
      )}
    </div>
  );
}

/**
 * beat-seeker のタブ。登録した場合の、BEAT-PT・Rate-PT の変動と、ティアのゲージ（保存しない）。
 * 返ってきた値は、本人への表示だけに使う
 */
export default function BeatSeekerTab({ state }: { state: BeatSeekerPreviewState }) {
  switch (state.kind) {
    case "off":
      return <Message>設定の「アカウント連携 › beat-seeker」で連携すると、BEAT-PT・ティアの変動をここで確かめられます</Message>;
    case "unsupported":
      return <Message>SP の最新バージョンのスコアだけ、beat-seeker に登録できます</Message>;
    case "need-lamp":
      return <Message>クリアランプを選ぶと、BEAT-PT・ティアの変動を確かめられます</Message>;
    case "loading":
      return (
        <div className="flex flex-col gap-3" aria-label="beat-seeker で変動を確かめています">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      );
    case "failed":
      return <Failure result={state.result} />;
    case "ok":
      return <Loaded preview={state.preview} />;
  }
}
