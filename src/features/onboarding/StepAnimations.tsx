import { Check } from "lucide-react";
import { GUIDE_KEYS, GUIDE_LABELS, GUIDE_LAYOUTS, type GuideLayout, type NormRect } from "@/lib/vision/guides";
import type { CSSProperties } from "react";

const rectStyle = (r: NormRect): CSSProperties => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });

/** リザルト画面を、ごく簡単に描いたもの。スコア（水色の数字）・曲名（文字の行）・判定（小さな行）が、渡した配置の場所にある */
function FauxResult({ layout }: { layout: GuideLayout }) {
  return (
    <>
      <div className="absolute flex items-center justify-around rounded-[2px] bg-primary/15 px-[2px]" style={rectStyle(layout.score)}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1/2 w-[3px] rounded-full bg-primary" />
        ))}
      </div>
      <div className="absolute flex flex-col justify-center gap-[3px] px-[3px]" style={rectStyle(layout.title)}>
        <span className="h-[3px] w-4/5 rounded-full bg-foreground/60" />
        <span className="h-[3px] w-3/5 rounded-full bg-foreground/35" />
      </div>
      <div className="absolute flex flex-col justify-around px-[3px]" style={rectStyle(layout.judge)}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-[2px] rounded-full bg-foreground/30" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </>
  );
}

/** 枠が、最初はずれたところにあり、画面の各部分へ動いて合う（指でドラッグして合わせる様子）。繰り返す */
const START: Record<(typeof GUIDE_KEYS)[number], { dx: string; dy: string; s: number }> = {
  score: { dx: "-38px", dy: "-62px", s: 1.5 },
  title: { dx: "-44px", dy: "34px", s: 0.8 },
  judge: { dx: "34px", dy: "52px", s: 1.4 },
};

export function CalibrateAnimation() {
  const layout = GUIDE_LAYOUTS["1P"];
  return (
    <div aria-hidden className="relative mx-auto w-40 overflow-hidden rounded-md border border-border bg-secondary/70" style={{ aspectRatio: "9 / 16" }}>
      <FauxResult layout={layout} />
      {GUIDE_KEYS.map((key, i) => (
        <div
          key={key}
          className="calib-frame absolute rounded-sm border-2"
          style={{ ...rectStyle(layout[key]), "--dx": START[key].dx, "--dy": START[key].dy, "--s": START[key].s, animationDelay: `${i * 0.25}s` } as CSSProperties}
        >
          <span className="absolute -top-4 left-0 text-[9px] whitespace-nowrap text-foreground">{GUIDE_LABELS[key]}</span>
          {/* ドラッグしている指 */}
          <span className="calib-finger absolute -right-2 -bottom-3 size-4 rounded-full border border-background bg-foreground/90 shadow" style={{ animationDelay: `${i * 0.25}s` }} />
        </div>
      ))}
    </div>
  );
}

/** カメラの画面。斜めにずれた画面が動いて、白枠にぴったり重なると、枠が緑になって OK が出る。繰り返す */
export function AlignAnimation({ layout, aspect }: { layout: GuideLayout; aspect: number }) {
  return (
    <div aria-hidden className="relative mx-auto w-48 overflow-hidden rounded-md border border-border bg-background" style={{ aspectRatio: String(aspect) }}>
      <div className="align-screen absolute inset-0 rounded-md bg-secondary" style={{ "--ax": "26px", "--ay": "-22px" } as CSSProperties}>
        <FauxResult layout={layout} />
      </div>
      {GUIDE_KEYS.map((key) => (
        <div key={key} className="align-frame absolute rounded-sm border-2" style={rectStyle(layout[key])}>
          <span className="absolute -top-4 left-0 text-[10px] whitespace-nowrap text-foreground">{GUIDE_LABELS[key]}</span>
        </div>
      ))}
      <span className="align-ok absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-success text-background">
        <Check className="size-4" />
      </span>
    </div>
  );
}
