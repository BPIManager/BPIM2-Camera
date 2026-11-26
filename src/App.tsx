import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, History, Settings as SettingsIcon } from "lucide-react";
import CameraView from "@/features/camera/CameraView";
import HistoryView from "@/features/history/HistoryView";
import Onboarding from "@/features/onboarding/Onboarding";
import type { Draft } from "@/features/result/draft";
import ResultDrawer from "@/features/result/ResultDrawer";
import SettingsView from "@/features/settings/SettingsView";
import { useMaster } from "@/hooks/useMaster";
import { useSettings } from "@/hooks/useSettings";
import { TesseractRecognizer } from "@/lib/recognition/ocr/tesseractRecognizer";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import { WorkerOcrEngine } from "@/lib/recognition/paddle/workerEngine";
import { logDebug } from "@/lib/debug/ocrLog";
import type { Recognizer } from "@/lib/recognition/recognizer";
import type { SongMasterEntry } from "@/lib/songs/types";
import { resolveResult } from "@/lib/recognition/resolve";
import type { GuideKey } from "@/lib/vision/guides";
import { cn } from "@/lib/utils";

type Tab = "camera" | "history" | "settings";

const TABS = [
  { id: "camera", label: "撮影", Icon: Camera },
  { id: "history", label: "履歴", Icon: History },
  { id: "settings", label: "設定", Icon: SettingsIcon },
] as const;

const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

export default function App() {
  const { settings, update } = useSettings();
  const { songs } = useMaster();
  const [tab, setTab] = useState<Tab>("camera");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  // カメラ表示領域の大きさ。設定の枠調整が同じ縦横比で表示するために保持する
  const [viewSize, setViewSize] = useState({ width: window.innerWidth, height: Math.max(200, window.innerHeight - 170) });
  const onViewSize = useCallback((s: { width: number; height: number }) => s.width > 0 && setViewSize(s), []);
  const songsRef = useRef<readonly SongMasterEntry[]>(songs);
  songsRef.current = songs;
  const engineRef = useRef<WorkerOcrEngine | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  if (!recognizerRef.current) {
    engineRef.current = new WorkerOcrEngine();
    // 枠で撮った画像は PaddleOCR、全体画像の取り込みは Tesseract で読む
    recognizerRef.current = new PaddleRecognizer(engineRef.current, () => songsRef.current, new TesseractRecognizer(() => songsRef.current));
  }

  // PaddleOCR のモデルを撮影前に読み込んでおく
  useEffect(() => {
    void engineRef.current?.warmUp().catch(() => undefined);
  }, []);

  if (!settings.onboarded) {
    return (
      <Onboarding
        ios={isIos}
        standalone={isStandalone}
        onDone={({ statsConsent, playSide }) => update({ onboarded: true, statsConsent, playSide })}
      />
    );
  }

  const handleCapture = async (image: Blob, source: "camera" | "import", regions?: Record<GuideKey, Blob>) => {
    setBusy(true);
    let raw = null;
    try {
      const full = await createImageBitmap(image);
      const crops = regions
        ? ({
            score: await createImageBitmap(regions.score),
            title: await createImageBitmap(regions.title),
            judge: await createImageBitmap(regions.judge),
          } satisfies Record<GuideKey, ImageBitmap>)
        : undefined;
      logDebug(`撮影: ${source} / 枠で切り出し: ${crops ? "あり" : "なし"} / 分離ページ: ${self.crossOriginIsolated}`);
      raw = await recognizerRef.current!.recognize({ full, regions: crops }).catch((e: unknown) => {
        logDebug("読み取りに失敗: " + (e instanceof Error ? e.stack ?? e.message : String(e)));
        return null;
      });
      if (!raw) logDebug("読み取り結果なし（何も読めなかった）");
      full.close();
      if (crops) for (const b of Object.values(crops)) b.close();
    } finally {
      setBusy(false);
    }
    setDraft({
      id: crypto.randomUUID(),
      image,
      source,
      regions,
      raw,
      resolution: raw ? resolveResult(raw, songs) : null,
    });
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <main className="min-h-0 flex-1">
        {tab === "camera" && <CameraView active={draft === null} busy={busy} side={settings.playSide} guides={settings.guides} onViewSize={onViewSize} onCapture={handleCapture} />}
        {tab === "history" && <HistoryView active />}
        {tab === "settings" && <SettingsView settings={settings} update={update} viewSize={viewSize} />}
      </main>
      <nav className="grid grid-cols-3 border-t border-border pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-xs transition-colors",
              tab === id ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
      {draft && <ResultDrawer key={draft.id} draft={draft} songs={songs} settings={settings} onClose={() => setDraft(null)} />}
    </div>
  );
}
