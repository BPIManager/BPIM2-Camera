import { cn } from "@/lib/utils";

/**
 * BPIM2 Camera のロゴ。ファインダーの四隅（Camera）の中に、BPIM2 のロゴと同じ
 * 「段々と低くなる 4 本の棒」を置く。2 本目だけ濃く、水色にして、狙う 1 点を表す。
 */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="BPIM2 Camera" className={cn("size-24", className)}>
      <rect width="96" height="96" rx="22" className="fill-card" />
      {/* ファインダーの四隅 */}
      <g fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="stroke-foreground">
        <path d="M22 34V26a4 4 0 0 1 4-4h8" />
        <path d="M62 22h8a4 4 0 0 1 4 4v8" />
        <path d="M74 62v8a4 4 0 0 1-4 4h-8" />
        <path d="M34 74h-8a4 4 0 0 1-4-4v-8" />
      </g>
      {/* BPIM2 の 4 本の棒（高い順に並び、底をそろえる） */}
      <rect x="28" y="31" width="7" height="34" rx="1.5" className="fill-brand-bpim" opacity="0.45" />
      <rect x="39" y="42" width="7" height="23" rx="1.5" className="fill-primary" />
      <rect x="50" y="52" width="7" height="13" rx="1.5" className="fill-brand-bpim" opacity="0.45" />
      <rect x="61" y="60" width="7" height="5" rx="1.5" className="fill-brand-bpim" opacity="0.45" />
    </svg>
  );
}
