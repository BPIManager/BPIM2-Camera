import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import Button from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import type { Size } from "@/lib/vision/framing";
import { guideRects } from "@/lib/vision/guides";
import type { PlaySide } from "@/lib/storage/settings";

interface Props {
  active: boolean;
  busy: boolean;
  side: PlaySide;
  onCapture: (image: Blob, source: "camera" | "import", regions?: { score: Blob; title: Blob }) => void;
}

/** スコアと曲名帯の位置を白枠で示す（1P/2P で左右反転）。シャッター時は各枠の中を切り出して読み取る */
export default function CameraView({ active, busy, side, onCapture }: Props) {
  const { videoRef, state, snapshot } = useCamera(active);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setView({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rects = guideRects(side, view);

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div ref={viewRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="size-full object-cover" playsInline muted />
        {(
          [
            ["スコア", rects.score],
            ["曲名・譜面", rects.title],
          ] as const
        ).map(([label, r]) => (
          <div
            key={label}
            className="pointer-events-none absolute rounded-sm border-2 border-guide"
            style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          >
            <span className="absolute -top-6 left-0 text-xs font-medium">{label}</span>
          </div>
        ))}
        <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm font-medium">
          スコアと曲名を白枠に重ねてください
        </p>
        {busy && (
          <p className="absolute inset-x-0 bottom-6 text-center text-sm font-medium" role="status">
            読み取っています
          </p>
        )}
        {state !== "ready" && (
          <p className="absolute inset-x-0 top-1/2 px-6 text-center text-sm text-muted-foreground">
            {state === "denied" && "カメラが許可されていません。画像の取り込みは使えます"}
            {state === "unsupported" && "この端末ではカメラを使えません。画像の取り込みは使えます"}
            {state === "starting" && "カメラを起動しています"}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="icon" aria-label="画像を取り込む" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-6" />
        </Button>
        <button
          type="button"
          aria-label="撮影"
          disabled={state !== "ready" || busy}
          onClick={async () => {
            const shot = await snapshot({ rects, view });
            if (shot) onCapture(shot.image, "camera", shot.regions);
          }}
          className="size-16 rounded-full border-4 border-foreground bg-foreground/90 transition-transform active:scale-95 disabled:opacity-40"
        />
        <div className="size-10" />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCapture(f, "import");
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
