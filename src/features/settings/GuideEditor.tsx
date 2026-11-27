import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import GuideCanvas from "@/components/guide-canvas";
import Button from "@/components/ui/button";
import type { Size } from "@/lib/vision/framing";
import { GUIDE_LAYOUTS, type GuideLayout } from "@/lib/vision/guides";

interface Props {
  initial: GuideLayout;
  /** 枠の基準にしている写真の縦横比。なければカメラ表示領域と同じ */
  initialAspect?: number | null;
  /** 見出し。既定は「枠の位置」 */
  title?: string;
  /** 閉じるボタンの文言。既定は「キャンセル」 */
  closeLabel?: string;
  /** 保存ボタンの文言。既定は「保存」 */
  saveLabel?: string;
  /** true なら、背景の画像を選ぶまで保存できない（キャリブレーションには画像が要る） */
  requireImage?: boolean;
  /** カメラ表示領域の大きさ。同じ縦横比で表示し、保存する割合をカメラと一致させる */
  viewSize: Size;
  /** 保存する枠と、その基準にした写真の縦横比（幅 / 高さ） */
  onSave: (layout: GuideLayout, aspect: number | null) => void;
  onClose: () => void;
}

/** 背景に好きなリザルト画像を置き、3 つの枠をドラッグ・四隅で拡大縮小して位置を決める */
export default function GuideEditor({ initial, title = "枠の位置", closeLabel = "キャンセル", saveLabel = "保存", requireImage = false, initialAspect = null, viewSize, onSave, onClose }: Props) {
  const [layout, setLayout] = useState<GuideLayout>(initial);
  const [bg, setBg] = useState<string | null>(null);
  // 枠は写真に対する割合で持つ。写真を選んだらその縦横比、なければ保存済みの縦横比、なければ表示領域と同じ
  const [aspect, setAspect] = useState<number | null>(initialAspect);
  const boxAspect = aspect ?? viewSize.width / viewSize.height;
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (bg) URL.revokeObjectURL(bg);
    },
    [bg],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="font-medium">{title}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> 画像
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLayout(GUIDE_LAYOUTS["1P"])}>
            <RotateCcw /> 初期位置
          </Button>
        </div>
      </header>

      <GuideCanvas
        layout={layout}
        onChange={setLayout}
        aspect={boxAspect}
        background={bg}
        placeholder={<p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">「画像」から、リザルト画面の写真を選ぶと、背景に表示されます</p>}
      />

      <footer className="grid grid-cols-2 gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={onClose}>
          {closeLabel}
        </Button>
        <Button disabled={requireImage && !bg} onClick={() => onSave(layout, aspect)}>
          {saveLabel}
        </Button>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const url = URL.createObjectURL(f);
            const img = new Image();
            img.onload = () => img.naturalWidth > 0 && img.naturalHeight > 0 && setAspect(img.naturalWidth / img.naturalHeight);
            img.src = url;
            setBg(url);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
