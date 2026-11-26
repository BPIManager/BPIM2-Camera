import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import Button from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { computeGuideRect, type Size } from "@/lib/vision/framing";

interface Props {
  active: boolean;
  busy: boolean;
  onCapture: (image: Blob, source: "camera" | "import") => void;
}

const CORNERS = [
  "left-0 top-0 border-l-4 border-t-4 rounded-tl-md",
  "right-0 top-0 border-r-4 border-t-4 rounded-tr-md",
  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-md",
  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-md",
];

/** 曲名とスコアが入る範囲を白枠で示す。シャッター時は枠の中だけを切り出して読み取る */
export default function CameraView({ active, busy, onCapture }: Props) {
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

  const guide = computeGuideRect(view);

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div ref={viewRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="size-full object-cover" playsInline muted />
        <div
          className="pointer-events-none absolute shadow-[0_0_0_100vmax_var(--scrim)]"
          style={{ left: guide.x, top: guide.y, width: guide.width, height: guide.height }}
        >
          {CORNERS.map((c) => (
            <span key={c} className={`absolute size-8 border-guide ${c}`} />
          ))}
          <p className="absolute inset-x-0 -top-8 text-center text-sm font-medium">曲名とスコアを枠に収めてください</p>
        </div>
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
            const blob = await snapshot({ rect: guide, view });
            if (blob) onCapture(blob, "camera");
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
