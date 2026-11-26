import { useEffect } from "react";
import type { Settings } from "@/lib/storage/settings";
import { flushIfEnabled } from "@/lib/training/upload";

/** 起動時・設定の変更時・オンライン復帰時に、未送信の学習サンプルを送る（失敗しても撮影には影響しない） */
export function useSampleUpload(settings: Pick<Settings, "onboarded" | "statsConsent" | "statsIncludeImage" | "deviceId">) {
  const { onboarded, statsConsent, statsIncludeImage, deviceId } = settings;
  useEffect(() => {
    if (!onboarded) return;
    const run = () => void flushIfEnabled({ statsConsent, statsIncludeImage, deviceId })?.catch(() => undefined);
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [onboarded, statsConsent, statsIncludeImage, deviceId]);
}
