import { useEffect, useRef, useState } from "react";
import { logDebug } from "@/lib/debug/ocrLog";
import {
  createTinyWorker,
  WorkerOcrEngine,
} from "@/lib/recognition/paddle/workerEngine";
import {
  AutoCaptureGate,
  POLL_INTERVAL_MS,
  STILL_MAX_DIFF,
  screenPlausible,
} from "@/lib/vision/autoCapture";
import { frameDiff, type Gray } from "@/lib/vision/frame";
import type { Size } from "@/lib/vision/framing";
import type { GuideKey, GuideRects } from "@/lib/vision/guides";

interface Args {
  /** 下見を使えるか（自動撮影がオンで、カメラが映っているとき）。この間、tiny の OCR を保持する */
  enabled: boolean;
  /** 一時停止（読み取り中）。OCR は保持したまま、下見だけ止める */
  paused: boolean;
  grabGray: () => Gray | null;
  grabRegions: (guides: {
    rects: GuideRects;
    view: Size;
  }) => Promise<Record<GuideKey, ArrayBuffer> | null>;
  guides: { rects: GuideRects; view: Size };
  /** 撮影してよいとき（シャッターと同じ撮影を始める） */
  onTrigger: () => void;
}

/**
 * 自動撮影。映像が静止したら、3 つの枠を tiny の OCR で下見して、それらしい文字がそろっていれば、撮影を始める。
 * 動かしている間は OCR を回さない（静止を確かめてから）。返り値は、いま「枠に画面が合っていて、撮影を待っている」か。
 * 読み取り中は一時停止し、再開したときは、すぐには撮影しない（中止した直後に、同じ画面で撮り直さない）。
 */
export function useAutoCapture({
  enabled,
  paused,
  grabGray,
  grabRegions,
  guides,
  onTrigger,
}: Args): boolean {
  const [detected, setDetected] = useState(false);
  // 下見の最中に最新の値を使えるよう、ref に持つ（下見のたびに作り直さない）
  const latest = useRef({ guides, onTrigger, grabGray, grabRegions, paused });
  latest.current = { guides, onTrigger, grabGray, grabRegions, paused };

  useEffect(() => {
    if (!enabled) return;
    const engine = new WorkerOcrEngine(createTinyWorker);
    const gate = new AutoCaptureGate();
    let prev: Gray | null = null;
    let wasPaused = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void engine.warmUp().catch(() => undefined);

    const tick = async () => {
      if (stopped) return;
      try {
        if (latest.current.paused) {
          wasPaused = true;
        } else {
          const gray = latest.current.grabGray();
          if (wasPaused) {
            // 再開した直後は、前のフレームがないので、動いたとはみなさない（待ち受けに戻さず、基準のフレームだけ取る）
            wasPaused = false;
            prev = gray;
          } else {
            const diff = gray && prev ? frameDiff(prev, gray) : 255;
            const still = diff <= STILL_MAX_DIFF;
            prev = gray;

            let plausible: boolean | null = null;
            if (still) {
              const crops = await latest.current.grabRegions(
                latest.current.guides,
              );
              if (crops && !stopped && !latest.current.paused) {
                const [score, title, judge] = await Promise.all([
                  engine.readLines(crops.score),
                  engine.readLines(crops.title),
                  engine.readLines(crops.judge),
                ]);
                const p = screenPlausible({ score, title, judge });
                plausible = p.all;
              }
            }
            if (!stopped && !latest.current.paused) {
              const result = gate.update(still, plausible);
              setDetected(result.detected);
              if (result.trigger) {
                logDebug("自動撮影: 枠に画面が合ったので撮影");
                latest.current.onTrigger();
              }
            }
          }
        }
      } catch {
        /* 下見の失敗は、次の回でやり直す */
      }
      if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
      engine.dispose();
      setDetected(false);
    };
  }, [enabled]);

  return enabled && !paused && detected;
}
