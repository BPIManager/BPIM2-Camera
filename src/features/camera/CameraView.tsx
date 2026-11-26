import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import Button from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";

interface Props {
  active: boolean;
  busy: boolean;
  onCapture: (image: Blob, source: "camera" | "import") => void;
}

/** 背面カメラ映像に 16:9 の白枠ガイドを重ねる。モニター全体を枠に合わせてもらう */
export default function CameraView({ active, busy, onCapture }: Props) {
  const { videoRef, state, snapshot } = useCamera(active);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="size-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="aspect-video w-full max-w-3xl rounded-sm border-2 border-guide/90" />
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
            const blob = await snapshot();
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
