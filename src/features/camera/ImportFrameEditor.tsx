import { useEffect, useState } from "react";
import { LoaderCircle, RotateCcw, Wand2 } from "lucide-react";
import GuideCanvas from "@/components/guide-canvas";
import Button from "@/components/ui/button";
import type { OcrEngine } from "@/lib/recognition/paddle/engine";
import type { SongMasterEntry } from "@/lib/songs/types";
import type { GuideKey, GuideLayout } from "@/lib/vision/guides";
import type { Rect } from "@/lib/vision/framing";
import { cropRegions, detectFrames, layoutToPixels } from "@/lib/vision/importFrames";

type Detect = "running" | "found" | "missed";

interface Props {
  image: Blob;
  /** 自動で合わせられなかったときの枠（保存済みの枠など） */
  fallback: GuideLayout;
  /** 枠の自動推定に使う OCR。準備ができていなければ null（自動推定はしない） */
  getEngine: () => OcrEngine | null;
  /** 曲データ（曲名の行を、枠の手がかりにする） */
  songs: readonly SongMasterEntry[];
  /** 枠を確定したとき。枠の中を切り出した画像を渡す */
  onConfirm: (regions: Record<GuideKey, Blob>, frames: Record<GuideKey, Rect>) => void;
  onCancel: () => void;
}

/**
 * 取り込んだ画像に、撮影枠を合わせるステップ。まず自動で枠を置き、ずれていればユーザーが直して「読み取る」で確定する。
 * 確定したら、撮影と同じく、枠の中を切り出して読む
 */
export default function ImportFrameEditor({ image, fallback, getEngine, songs, onConfirm, onCancel }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [layout, setLayout] = useState<GuideLayout>(fallback);
  const [detected, setDetected] = useState<GuideLayout | null>(null);
  const [status, setStatus] = useState<Detect>("running");
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    const u = URL.createObjectURL(image);
    setUrl(u);
    let alive = true;
    let bmp: ImageBitmap | null = null;
    void (async () => {
      try {
        bmp = await createImageBitmap(image);
        if (!alive) return bmp.close();
        setBitmap(bmp);
        const engine = getEngine();
        const fit = engine ? await detectFrames(bmp, engine, songs) : null;
        if (!alive) return;
        if (fit) {
          setLayout(fit.layout);
          setDetected(fit.layout);
        }
        setStatus(fit ? "found" : "missed");
      } catch {
        if (alive) setStatus("missed");
      }
    })();
    return () => {
      alive = false;
      URL.revokeObjectURL(u);
      bmp?.close();
    };
    // 画像ごとに 1 回だけ推定する
  }, [image]);

  const aspect = bitmap ? bitmap.width / bitmap.height : 9 / 16;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="font-medium">枠を合わせる</h2>
        <Button variant="ghost" size="sm" disabled={status === "running"} onClick={() => setLayout(detected ?? fallback)}>
          <RotateCcw /> {detected ? "自動の位置" : "初期位置"}
        </Button>
      </header>
      <p className="flex items-center gap-2 px-4 pt-3 text-sm text-muted-foreground" role="status">
        {status === "running" ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> 画像から枠の位置を探しています
          </>
        ) : status === "found" ? (
          <>
            <Wand2 className="size-4 text-primary" aria-hidden /> 自動で枠を合わせました。ずれていれば、枠をなぞって直してください
          </>
        ) : (
          "自動では合わせられませんでした。スコア・曲名・判定の枠を、画面の各部分に合わせてください"
        )}
      </p>
      <GuideCanvas layout={layout} onChange={setLayout} aspect={aspect} background={url} disabled={status === "running"} />
      <footer className="grid grid-cols-2 gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          disabled={!bitmap || status === "running" || cropping}
          onClick={async () => {
            if (!bitmap) return;
            setCropping(true);
            try {
              onConfirm(await cropRegions(bitmap, layout), layoutToPixels(layout, bitmap));
            } finally {
              setCropping(false);
            }
          }}
        >
          読み取る
        </Button>
      </footer>
    </div>
  );
}
