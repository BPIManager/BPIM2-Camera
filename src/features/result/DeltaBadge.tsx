import { cn } from "@/lib/utils";
import { formatDelta } from "./BeatSeekerPreview";

const PILL = "inline-flex min-w-0 shrink-0 items-center truncate rounded-full px-1.5 h-3.5 text-[10px] leading-[14px] font-medium tabular-nums";

/**
 * 総合 BPI・総合 PT の差を、値の下の空きに出す小さなバッジ（「総合+0.56」）。行の高さは変えない。
 * 上がったときは緑、変わらない・下がったときは目立たせない。title に、前 → 後を入れる
 */
export function DeltaBadge({ delta, title, prefix = "総合" }: { delta: number; title?: string; prefix?: string }) {
  return (
    <span title={title} className={cn(PILL, delta > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
      {prefix}
      {formatDelta(delta)}
    </span>
  );
}

/** 取得中・取得できなかったときの、バッジの場所取り */
export function BadgeNote({ tone, children }: { tone: "loading" | "warning"; children?: React.ReactNode }) {
  return tone === "loading" ? (
    <span aria-hidden className={cn(PILL, "w-12 animate-pulse bg-muted")} />
  ) : (
    <span className={cn(PILL, "bg-warning/15 text-warning")}>{children}</span>
  );
}
