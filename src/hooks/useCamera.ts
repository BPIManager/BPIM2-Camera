import { useCallback, useEffect, useRef, useState } from "react";
import { openCameraStream } from "@/lib/camera/stream";
import { guideToVideoRect, type Rect, type Size } from "@/lib/vision/framing";
import { STILL_FRAME_WIDTH } from "@/lib/vision/autoCapture";
import { toGray, type Gray } from "@/lib/vision/frame";
import { GUIDE_KEYS, type GuideKey, type GuideRects } from "@/lib/vision/guides";

export interface Snapshot {
  image: Blob;
  regions?: Record<GuideKey, Blob>;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));

export type CameraState = "idle" | "starting" | "ready" | "denied" | "unsupported";

/** ズームの範囲。digital は、端末のカメラがズームに対応していないときの代用（映像を拡大して、中央を使う） */
export interface ZoomInfo {
  min: number;
  max: number;
  step: number;
  digital: boolean;
}

const DIGITAL_ZOOM: ZoomInfo = { min: 1, max: 4, step: 0.1, digital: true };

type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } };

/** 背面カメラを起動し、アンマウントで確実に止める。ズームは、カメラ自体のズームを使い、使えない端末では映像の拡大で代用する */
export function useCamera(enabled: boolean, deviceId: string | null = null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [zoomInfo, setZoomInfo] = useState<ZoomInfo | null>(null);
  const [zoom, setZoomState] = useState(1);
  // snapshot が使う最新のズーム（コールバックを作り直さないよう、ref にも持つ）
  const digitalZoomRef = useRef(1);
  // カメラ自体のズームは、スライダーやピンチで頻繁に変わる。描画ごとに最新の値だけを送る
  const pendingZoomRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setState("starting");
    setZoomInfo(null);
    openCameraStream(deviceId)
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const track = s.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const hw = (track?.getCapabilities?.() as ZoomCapabilities | undefined)?.zoom;
        if (hw && hw.max > hw.min) {
          setZoomInfo({ min: hw.min, max: hw.max, step: hw.step || 0.1, digital: false });
          setZoomState(hw.min);
          digitalZoomRef.current = 1;
        } else {
          setZoomInfo(DIGITAL_ZOOM);
          setZoomState(1);
          digitalZoomRef.current = 1;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
        }
        setState("ready");
      })
      .catch(() => !cancelled && setState("denied"));
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      pendingZoomRef.current = null;
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, deviceId]);

  /** ズームの倍率を変える。カメラが対応していればカメラ自体のズーム、なければ映像の拡大 */
  const setZoom = useCallback(
    (value: number) => {
      if (!zoomInfo) return;
      const z = Math.min(zoomInfo.max, Math.max(zoomInfo.min, value));
      setZoomState(z);
      if (zoomInfo.digital) {
        digitalZoomRef.current = z;
        return;
      }
      pendingZoomRef.current = z;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const next = pendingZoomRef.current;
        pendingZoomRef.current = null;
        if (next !== null) void trackRef.current?.applyConstraints({ advanced: [{ zoom: next } as unknown as MediaTrackConstraintSet] }).catch(() => undefined);
      });
    },
    [zoomInfo],
  );

  /** 全体画像と、ガイド枠（表示座標）で切り出したスコア部・曲名帯を返す */
  const snapshot = useCallback(async (guides?: { rects: GuideRects; view: Size }): Promise<Snapshot | null> => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    const src = { width: v.videoWidth, height: v.videoHeight };
    const full = document.createElement("canvas");
    full.width = src.width;
    full.height = src.height;
    full.getContext("2d")?.drawImage(v, 0, 0);

    const crop = (r: Rect) => {
      const c = document.createElement("canvas");
      c.width = r.width;
      c.height = r.height;
      c.getContext("2d")?.drawImage(full, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      return toBlob(c);
    };
    // デジタルズーム中は、映像の中央を拡大して見せているので、画面に見えている範囲を保存し、枠もその拡大に合わせて映像の座標に直す
    const dz = digitalZoomRef.current;
    const toRect = (g: Rect) => guideToVideoRect(g, guides!.view, src, dz);
    const visible = guides && dz > 1 ? toRect({ x: 0, y: 0, width: guides.view.width, height: guides.view.height }) : null;
    const image = await (visible ? crop(visible) : toBlob(full));
    if (!image) return null;
    if (!guides) return { image };
    const crops = await Promise.all(GUIDE_KEYS.map(async (k) => [k, await crop(toRect(guides.rects[k]))] as const));
    if (crops.some(([, b]) => !b)) return { image };
    return { image, regions: Object.fromEntries(crops) as Record<GuideKey, Blob> };
  }, []);

  /** 自動撮影の静止の判定用に、映像を小さな輝度画像にして返す（保存や撮影はしない。軽い） */
  const grabGray = useCallback((): Gray | null => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    const w = STILL_FRAME_WIDTH;
    const h = Math.max(1, Math.round((v.videoHeight * w) / v.videoWidth));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return toGray(ctx.getImageData(0, 0, w, h).data, w, h);
  }, []);

  /** 白枠の 3 か所を、下見の OCR 用に小さく切り出す（PNG のバイト列）。デジタルズームも反映する */
  const grabRegions = useCallback(async (guides: { rects: GuideRects; view: Size }): Promise<Record<GuideKey, ArrayBuffer> | null> => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    const src = { width: v.videoWidth, height: v.videoHeight };
    // 下見は粗くてよい。枠ごとの横幅の上限
    const TARGET: Record<GuideKey, number> = { score: 320, title: 640, judge: 480 };
    const out = {} as Record<GuideKey, ArrayBuffer>;
    for (const k of GUIDE_KEYS) {
      const r = guideToVideoRect(guides.rects[k], guides.view, src, digitalZoomRef.current);
      if (r.width < 4 || r.height < 4) return null;
      const scale = Math.min(1, TARGET[k] / r.width);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(r.width * scale));
      c.height = Math.max(1, Math.round(r.height * scale));
      c.getContext("2d")?.drawImage(v, r.x, r.y, r.width, r.height, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
      if (!blob) return null;
      out[k] = await blob.arrayBuffer();
    }
    return out;
  }, []);

  return { videoRef, state, snapshot, zoom, zoomInfo, setZoom, grabGray, grabRegions };
}
