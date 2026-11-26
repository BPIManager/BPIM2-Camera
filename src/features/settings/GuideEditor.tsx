import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import Button from "@/components/ui/button";
import type { Size } from "@/lib/vision/framing";
import { moveRect, resizeRect, type Corner } from "@/lib/vision/guideEdit";
import { GUIDE_LAYOUTS, type GuideKey, type GuideLayout } from "@/lib/vision/guides";
import type { PlaySide } from "@/lib/storage/settings";
import { cn } from "@/lib/utils";

interface Props {
  side: PlaySide;
  initial: GuideLayout;
  /** カメラ表示領域の大きさ。同じ縦横比で表示し、保存する割合をカメラと一致させる */
  viewSize: Size;
  onSave: (layout: GuideLayout) => void;
  onClose: () => void;
}

const LABELS: Record<GuideKey, string> = { score: "スコア", title: "曲名・譜面" };
const CORNERS: { corner: Corner; pos: string }[] = [
  { corner: "nw", pos: "-left-3 -top-3" },
  { corner: "ne", pos: "-right-3 -top-3" },
  { corner: "sw", pos: "-bottom-3 -left-3" },
  { corner: "se", pos: "-bottom-3 -right-3" },
];

type Drag = { key: GuideKey; mode: "move" | Corner; x: number; y: number; start: GuideLayout[GuideKey] };

/** 背景に好きなリザルト画像を置き、2 つの枠をドラッグ・四隅で拡大縮小して位置を決める */
export default function GuideEditor({ side, initial, viewSize, onSave, onClose }: Props) {
  const [layout, setLayout] = useState<GuideLayout>(initial);
  const [selected, setSelected] = useState<GuideKey>("score");
  const [bg, setBg] = useState<string | null>(null);
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const areaRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);

  // 利用可能な領域に、カメラ表示と同じ縦横比で収める
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const k = Math.min(el.clientWidth / viewSize.width, el.clientHeight / viewSize.height);
      setBox({ width: Math.floor(viewSize.width * k), height: Math.floor(viewSize.height * k) });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [viewSize.width, viewSize.height]);

  useEffect(
    () => () => {
      if (bg) URL.revokeObjectURL(bg);
    },
    [bg],
  );

  const begin = (e: React.PointerEvent, key: GuideKey, mode: Drag["mode"]) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(key);
    drag.current = { key, mode, x: e.clientX, y: e.clientY, start: layout[key] };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || box.width === 0) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    const next = d.mode === "move" ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.mode, dx, dy);
    setLayout((l) => ({ ...l, [d.key]: next }));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="font-medium">枠の位置（{side}）</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus /> 画像
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLayout(GUIDE_LAYOUTS[side])}>
            <RotateCcw /> 初期位置
          </Button>
        </div>
      </header>

      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center p-3">
        <div
          className="relative touch-none overflow-hidden rounded-md border border-border bg-card"
          style={{ width: box.width, height: box.height }}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {bg ? (
            <img src={bg} alt="" className="size-full object-cover" draggable={false} />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
              「画像」から、リザルト画面の写真を選ぶと、背景に表示されます
            </p>
          )}
          {(Object.keys(LABELS) as GuideKey[]).map((key) => {
            const r = layout[key];
            const on = selected === key;
            return (
              <div
                key={key}
                onPointerDown={(e) => begin(e, key, "move")}
                className={cn("absolute cursor-move touch-none rounded-sm border-2", on ? "border-primary" : "border-guide")}
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }}
              >
                <span className="absolute -top-6 left-0 text-xs font-medium">{LABELS[key]}</span>
                {on &&
                  CORNERS.map(({ corner, pos }) => (
                    <span
                      key={corner}
                      onPointerDown={(e) => begin(e, key, corner)}
                      className={cn("absolute size-6 touch-none rounded-full border-2 border-primary bg-background", pos)}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button onClick={() => onSave(layout)}>保存</Button>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setBg(URL.createObjectURL(f));
          e.target.value = "";
        }}
      />
    </div>
  );
}
