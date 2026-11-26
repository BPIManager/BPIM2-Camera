import { useCallback, useEffect, useRef, useState } from "react";
import { guideToVideoRect, type Rect, type Size } from "@/lib/vision/framing";

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

  /** ガイド枠（表示座標）が指定されたら、その範囲だけを切り出す */
  const snapshot = useCallback(async (guide?: { rect: Rect; view: Size }): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    const src = { width: v.videoWidth, height: v.videoHeight };
    const r = guide ? guideToVideoRect(guide.rect, guide.view, src) : { x: 0, y: 0, ...src };
    const c = document.createElement("canvas");
    c.width = r.width;
    c.height = r.height;
    c.getContext("2d")?.drawImage(v, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
  }, []);

  return { videoRef, state, snapshot };
}
