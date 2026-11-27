import { useEffect, useRef, useState } from "react";
import type { Size } from "@/lib/vision/framing";
import { moveRect, resizeRect, type Corner } from "@/lib/vision/guideEdit";
import { GUIDE_KEYS, GUIDE_LABELS, type GuideKey, type GuideLayout } from "@/lib/vision/guides";
import { cn } from "@/lib/utils";

const CORNERS: { corner: Corner; pos: string }[] = [
  { corner: "nw", pos: "-left-3 -top-3" },
  { corner: "ne", pos: "-right-3 -top-3" },
  { corner: "sw", pos: "-bottom-3 -left-3" },
  { corner: "se", pos: "-bottom-3 -right-3" },
];

type Drag = { key: GuideKey; mode: "move" | Corner; x: number; y: number; start: GuideLayout[GuideKey] };

/**
 * 画像の上に 3 つの枠を置き、ドラッグで動かし、四隅で大きさを変える。枠は画像に対する割合。
 * 与えられた領域に、縦横比（aspect）を保って収める。背景の画像がなければ、placeholder を出す
 */
export default function GuideCanvas({
  layout,
  onChange,
  aspect,
  background,
  placeholder,
  disabled = false,
}: {
  layout: GuideLayout;
  onChange: (layout: GuideLayout) => void;
  /** 幅 / 高さ */
  aspect: number;
  background?: string | null;
  placeholder?: React.ReactNode;
  disabled?: boolean;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [selected, setSelected] = useState<GuideKey>("score");
  const drag = useRef<Drag | null>(null);

  // 利用可能な領域に、縦横比を保って収める
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const width = Math.min(el.clientWidth, el.clientHeight * aspect);
      setBox({ width: Math.floor(width), height: Math.floor(width / aspect) });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [aspect]);

  const begin = (e: React.PointerEvent, key: GuideKey, mode: Drag["mode"]) => {
    if (disabled) return;
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
    onChange({ ...layout, [d.key]: d.mode === "move" ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.mode, dx, dy) });
  };

  return (
    <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center p-3">
      <div
        className="relative touch-none overflow-hidden rounded-md border border-border bg-card select-none"
        style={{ width: box.width, height: box.height }}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {background ? <img src={background} alt="" className="size-full" draggable={false} /> : placeholder}
        {GUIDE_KEYS.map((key) => {
          const r = layout[key];
          const on = selected === key && !disabled;
          return (
            <div
              key={key}
              onPointerDown={(e) => begin(e, key, "move")}
              className={cn("absolute touch-none rounded-sm border-2", disabled ? "pointer-events-none" : "cursor-move", on ? "border-primary" : "border-guide")}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }}
            >
              <span className="absolute -top-6 left-0 text-xs font-medium drop-shadow">{GUIDE_LABELS[key]}</span>
              {on &&
                CORNERS.map(({ corner, pos }) => (
                  <span key={corner} onPointerDown={(e) => begin(e, key, corner)} className={cn("absolute size-6 touch-none rounded-full border-2 border-primary bg-background", pos)} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
