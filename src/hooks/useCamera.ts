import { useCallback, useEffect, useRef, useState } from "react";
import { guideToVideoRect, type Rect, type Size } from "@/lib/vision/framing";
import { GUIDE_KEYS, type GuideKey, type GuideRects } from "@/lib/vision/guides";

export interface Snapshot {
  image: Blob;
  regions?: Record<GuideKey, Blob>;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));

export type CameraState = "idle" | "starting" | "ready" | "denied" | "unsupported";

/** 背面カメラを起動し、アンマウントで確実に止める */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>("idle");

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setState("starting");
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
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
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

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
    const toRect = (g: Rect) => guideToVideoRect(g, guides!.view, src);
    const image = await toBlob(full);
    if (!image) return null;
    if (!guides) return { image };
    const crops = await Promise.all(GUIDE_KEYS.map(async (k) => [k, await crop(toRect(guides.rects[k]))] as const));
    if (crops.some(([, b]) => !b)) return { image };
    return { image, regions: Object.fromEntries(crops) as Record<GuideKey, Blob> };
  }, []);

  return { videoRef, state, snapshot };
}
