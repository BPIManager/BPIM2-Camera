import { useCallback, useEffect, useRef, useState } from "react";

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

  const snapshot = useCallback(async (): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
  }, []);

  return { videoRef, state, snapshot };
}
