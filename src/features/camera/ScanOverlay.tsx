import { CircleAlert, CircleCheck } from "lucide-react";
import type { SongProgress } from "@/lib/recognition/recognizer";
import type { GuideRects } from "@/lib/vision/guides";
import { GUIDE_KEYS } from "@/lib/vision/guides";

/** 枠ごとのキラキラの位置（枠に対する %）・大きさ（px）・周期（s）・開始の遅れ（s）。固定値で、再描画してもちらつかない */
const SPARKLES = [
  { x: 8, y: 30, size: 12, dur: 1.6, delay: 0 },
  { x: 26, y: 72, size: 9, dur: 2.1, delay: 0.5 },
  { x: 45, y: 24, size: 14, dur: 1.8, delay: 1.1 },
  { x: 63, y: 66, size: 10, dur: 2.2, delay: 0.3 },
  { x: 80, y: 32, size: 13, dur: 1.7, delay: 0.8 },
  { x: 93, y: 70, size: 9, dur: 2, delay: 1.4 },
] as const;

/** 4 方向にとがった星 */
const STAR = "M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z";

/**
 * 読み取り中の演出。各枠の中に、走査線の掃引とキラキラ（Google レンズのような）を出し、
 * 下部に「いま何をしているか」を出す。待ち時間が退屈にならないようにするためのもの。
 * 動きを減らす設定の端末では、globals.css の規則で動きが止まる。
 */
export default function ScanOverlay({ rects, stage, song }: { rects: GuideRects; stage: string | null; song: SongProgress | null }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {GUIDE_KEYS.map((key, k) => {
          const r = rects[key];
          return (
            <div
              key={key}
              className="scan-frame absolute overflow-hidden rounded-sm"
              style={{ left: r.x, top: r.y, width: r.width, height: r.height, animationDelay: `${k * 0.25}s` }}
            >
              <div className="scan-line absolute inset-x-0 top-0 h-1/2" style={{ animationDelay: `${k * 0.35}s` }} />
              {SPARKLES.map((s, i) => (
                <svg
                  key={i}
                  viewBox="0 0 24 24"
                  className="sparkle absolute text-primary"
                  style={{
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: s.size,
                    height: s.size,
                    marginLeft: -s.size / 2,
                    marginTop: -s.size / 2,
                    animationDuration: `${s.dur}s`,
                    animationDelay: `${s.delay + k * 0.2}s`,
                  }}
                >
                  <path d={STAR} fill="currentColor" />
                </svg>
              ))}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-6 bottom-5 mx-auto flex w-fit max-w-full flex-col items-center gap-2">
        {/* 曲が確定したら（または読み取れないとわかったら）、進捗の上にすぐ出す。あとから変われば差し替える */}
        {song && (
          <p
            key={song.kind === "resolved" ? song.title : "unresolved"}
            role="status"
            className="animate-in fade-in slide-in-from-bottom-2 flex max-w-full items-center gap-2 rounded-lg bg-scrim px-3 py-2 text-sm font-medium duration-300"
          >
            {song.kind === "resolved" ? (
              <>
                <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 truncate">
                  <span className="text-success">曲名確定: </span>
                  {song.title}
                </span>
              </>
            ) : (
              <>
                <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                <span className="text-warning">曲名が読み取れませんでした</span>
              </>
            )}
          </p>
        )}
        <p role="status" aria-live="polite" className="flex max-w-full items-center gap-2 rounded-full bg-scrim px-4 py-2 text-sm font-medium">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
          {/* 段階が変わるたびに、ふわっと切り替える */}
          <span key={stage} className="animate-in fade-in slide-in-from-bottom-1 truncate duration-200">
            {stage ?? "読み取っています"}
          </span>
        </p>
      </div>
    </>
  );
}
