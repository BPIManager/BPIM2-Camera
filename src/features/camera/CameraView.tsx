import { useEffect, useRef, useState } from "react";
import { Diff, ImagePlus, Square } from "lucide-react";
import Button from "@/components/ui/button";
import ScanOverlay from "./ScanOverlay";
import { useCamera } from "@/hooks/useCamera";
import { useAutoCapture } from "./useAutoCapture";
import type { SongProgress } from "@/lib/recognition/recognizer";
import type { Size } from "@/lib/vision/framing";
import { cn } from "@/lib/utils";
import { moveRect, resizeRect, type Corner } from "@/lib/vision/guideEdit";
import { GUIDE_KEYS, GUIDE_LABELS, layoutToRects, referenceRect, resolveLayout, type GuideKey, type GuideLayout } from "@/lib/vision/guides";

interface Props {
  active: boolean;
  busy: boolean;
  /** 読み取り中の段階（画面に出す）。読み取っていなければ null */
  stage: string | null;
  /** 読み取りの途中でわかった曲の確定状況 */
  song: SongProgress | null;
  /** キャリブレーションした枠。未設定なら既定値 */
  layout: GuideLayout | null;
  /** 枠の基準にした写真の縦横比。あれば、その範囲を外枠として示す */
  layoutAspect: number | null;
  /** 表示領域の大きさ。設定の枠調整で同じ縦横比を使う */
  onViewSize: (size: Size) => void;
  onCapture: (image: Blob, source: "camera" | "import", regions?: Record<GuideKey, Blob>) => void;
  /** 読み取りの中止（読み取り中にシャッターボタンを押したとき） */
  onCancel: () => void;
  /** 自動撮影（静止して、枠に画面が合ったら、自動で読み取りを始める） */
  autoCapture: boolean;
  /** 枠をなぞって動かしたとき（指を離したときに 1 回）。新しい配置を保存する */
  onLayoutChange: (layout: GuideLayout) => void;
}

const CORNERS: { corner: Corner; pos: string }[] = [
  { corner: "nw", pos: "-left-3 -top-3" },
  { corner: "ne", pos: "-right-3 -top-3" },
  { corner: "sw", pos: "-bottom-3 -left-3" },
  { corner: "se", pos: "-bottom-3 -right-3" },
];

type Drag = { key: GuideKey; mode: "move" | Corner; x: number; y: number; start: GuideLayout[GuideKey] };

/** スコアと曲名帯の位置を白枠で示す。シャッター時は各枠の中を切り出して読み取る */
export default function CameraView({ active, busy, stage, song, layout, layoutAspect, onViewSize, onCapture, onCancel, autoCapture, onLayoutChange }: Props) {
  const { videoRef, state, snapshot, zoom, zoomInfo, setZoom, grabGray, grabRegions } = useCamera(active);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Size>({ width: 0, height: 0 });
  // 撮影した瞬間の画像。読み取り中は、これを映像の上に出して止める（カメラを構え続けなくてよいと分かるように）
  const [frozen, setFrozen] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (frozen) URL.revokeObjectURL(frozen);
    },
    [frozen],
  );
  const showFrozen = busy && frozen !== null;

  // ズーム。ふだんは隠しておき、シャッターの右のボタンで、下からスライダーを出す。映像のピンチでもズームできる
  const [zoomOpen, setZoomOpen] = useState(false);
  const [labelVisible, setLabelVisible] = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(labelTimer.current), []);
  const flashLabel = () => {
    setLabelVisible(true);
    clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setLabelVisible(false), 1200);
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: Math.max(1, distance()), zoom };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (busy || !pinch.current || pointers.current.size !== 2) return;
    // 指の間が 2 倍に開けば、ズームも 2 倍（始めたときの倍率を基準に）
    setZoom(pinch.current.zoom * (distance() / pinch.current.distance));
    flashLabel();
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => {
      const size = { width: el.clientWidth, height: el.clientHeight };
      setView(size);
      onViewSize(size);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [onViewSize]);

  // 枠の移動。なぞっている間は手元の配置（draft）で描き、指を離したときに保存する
  const [draft, setDraft] = useState<GuideLayout | null>(null);
  const [selected, setSelected] = useState<GuideKey>("score");
  const drag = useRef<Drag | null>(null);
  const draftRef = useRef<GuideLayout | null>(null);
  const resolved = draft ?? resolveLayout(layout);

  const reference = layoutAspect ? referenceRect(view, layoutAspect) : null;
  // 枠は基準の矩形（写真の縦横比、なければ表示領域全体）に対する割合
  const base = referenceRect(view, layoutAspect);
  const rects = layoutToRects(resolved, view, layoutAspect);

  const beginDrag = (e: React.PointerEvent, key: GuideKey, mode: Drag["mode"]) => {
    if (busy) return;
    // ピンチ（ズーム）の処理へ渡さない
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(key);
    drag.current = { key, mode, x: e.clientX, y: e.clientY, start: resolveLayout(layout)[key] };
    draftRef.current = null;
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || base.width === 0 || base.height === 0) return;
    const dx = (e.clientX - d.x) / base.width;
    const dy = (e.clientY - d.y) / base.height;
    const next = d.mode === "move" ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.mode, dx, dy);
    draftRef.current = { ...resolveLayout(layout), [d.key]: next };
    setDraft(draftRef.current);
  };
  const endDrag = () => {
    drag.current = null;
    const done = draftRef.current;
    draftRef.current = null;
    if (done) onLayoutChange(done);
    setDraft(null);
  };

  /** 撮影する（シャッターも、自動撮影も、これを使う） */
  const shoot = async () => {
    const shot = await snapshot({ rects, view });
    if (!shot) return;
    setFrozen(URL.createObjectURL(shot.image));
    onCapture(shot.image, "camera", shot.regions);
  };
  // 自動撮影: 静止して、枠に画面が合ったら、シャッターを押したのと同じ撮影を始める。
  // 結果の画面が開いている間（active が false）は止め、読み取り中は一時停止する
  const detected = useAutoCapture({
    enabled: autoCapture && active && state === "ready",
    // 枠をなぞっている間は、下見も撮影も止める
    paused: busy || draft !== null,
    grabGray,
    grabRegions,
    guides: { rects, view },
    onTrigger: () => void shoot(),
  });

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div
        ref={viewRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <video
          ref={videoRef}
          className="size-full object-cover"
          // カメラのズームに対応していない端末では、映像を中央から拡大する（撮影するときの座標変換も、この倍率を使う）
          style={zoomInfo?.digital ? { transform: `scale(${zoom})` } : undefined}
          playsInline
          muted
        />
        {showFrozen && <img src={frozen} alt="" className="absolute inset-0 size-full object-cover" />}
        {reference && (
          <div
            className="pointer-events-none absolute rounded-sm border border-dashed border-guide/50"
            style={{ left: reference.x, top: reference.y, width: reference.width, height: reference.height }}
          />
        )}
        {GUIDE_KEYS.map((key) => {
          const r = rects[key];
          const on = selected === key && !busy;
          return (
            <div
              key={key}
              onPointerDown={(e) => beginDrag(e, key, "move")}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className={cn(
                "absolute touch-none rounded-sm border-2 transition-colors",
                busy ? "pointer-events-none" : "cursor-move",
                detected ? "border-success" : on ? "border-primary" : "border-guide",
              )}
              style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
            >
              <span className="pointer-events-none absolute -top-6 left-0 text-xs font-medium">{GUIDE_LABELS[key]}</span>
              {on &&
                CORNERS.map(({ corner, pos }) => (
                  <span
                    key={corner}
                    onPointerDown={(e) => beginDrag(e, key, corner)}
                    className={cn("absolute size-6 touch-none rounded-full border-2 border-primary bg-background", pos)}
                  />
                ))}
            </div>
          );
        })}
        <p className="pointer-events-none absolute inset-x-0 top-3 px-4 text-center text-sm font-medium">
          {showFrozen
            ? "読み取っています。カメラはもう動かして大丈夫です"
            : busy
              ? "読み取っています"
              : detected
                ? "そのまま動かさないでください"
                : autoCapture
                  ? "白枠を画面の各部分に重ねると、自動で読み取ります（枠はなぞって動かせます）"
                  : "白枠を画面の各部分に重ねてください"}
        </p>
        {busy && <ScanOverlay rects={rects} stage={stage} song={song} />}
        {/* ピンチ中に、いまの倍率を大きく出す（すぐ消える） */}
        {labelVisible && zoomInfo && (
          <p className="pointer-events-none absolute inset-x-0 top-14 text-center text-3xl font-semibold tabular-nums drop-shadow">{zoom.toFixed(1)}×</p>
        )}
        {/* ズームのスライダー。下から上へ伸びて出る（上へ動かすと拡大）。ブラウザの拡大縮小は使わず、カメラ自体を拡大する */}
        {zoomOpen && zoomInfo && !busy && (
          <div className="zoom-rise absolute right-4 bottom-3 z-10 flex flex-col items-center gap-2 rounded-full bg-scrim px-2 py-3">
            <span className="text-xs font-medium tabular-nums">{zoom.toFixed(1)}×</span>
            <div className="relative h-44 w-9">
              <input
                type="range"
                aria-label="ズーム"
                min={zoomInfo.min}
                max={zoomInfo.max}
                step="any"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="zoom-slider absolute top-1/2 left-1/2 w-44 -translate-x-1/2 -translate-y-1/2 -rotate-90 touch-none"
              />
            </div>
          </div>
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
        <div className="relative size-16">
          <button
            type="button"
            aria-label={busy ? "読み取りを中止" : "撮影"}
            disabled={!busy && state !== "ready"}
            onClick={async () => {
              // 読み取り中は、中止ボタンになる
              if (busy) {
                onCancel();
                return;
              }
              await shoot();
            }}
            className="flex size-16 items-center justify-center rounded-full border-4 border-foreground bg-foreground/90 transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy && <Square className="size-6 fill-background text-background" aria-hidden />}
          </button>
          {/* 読み取り中は、シャッターの周りを光の輪が回る */}
          {busy && (
            <svg className="pointer-events-none absolute -inset-2 size-20 animate-spin" viewBox="0 0 80 80" fill="none" aria-hidden>
              <circle cx="40" cy="40" r="37" strokeWidth="3" className="stroke-border" />
              <circle cx="40" cy="40" r="37" strokeWidth="3" strokeLinecap="round" strokeDasharray="70 163" className="stroke-primary" />
            </svg>
          )}
        </div>
        {zoomInfo && state === "ready" ? (
          <Button variant="ghost" size="icon" aria-label="ズーム" aria-pressed={zoomOpen} className={cn(zoomOpen && "bg-accent")} onClick={() => setZoomOpen((v) => !v)}>
            <Diff className="size-6" />
          </Button>
        ) : (
          <div className="size-10" />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFrozen(null);
              onCapture(f, "import");
            }
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
