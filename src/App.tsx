import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import { Camera, History, Settings as SettingsIcon } from "lucide-react";
import CameraView from "@/features/camera/CameraView";
import HistoryView from "@/features/history/HistoryView";
import InstallDialog from "@/features/install/InstallDialog";
import Onboarding from "@/features/onboarding/Onboarding";
import type { Draft } from "@/features/result/draft";
import ResultDrawer from "@/features/result/ResultDrawer";
import SettingsView from "@/features/settings/SettingsView";
import { useMaster } from "@/hooks/useMaster";
import { useInstallMode } from "@/lib/pwa/install";
import { useSampleUpload } from "@/hooks/useSampleUpload";
import { useSettings } from "@/hooks/useSettings";
import { TesseractRecognizer } from "@/lib/recognition/ocr/tesseractRecognizer";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import { WorkerOcrEngine } from "@/lib/recognition/paddle/workerEngine";
import { isAbortError, raceAbort } from "@/lib/async/abort";
import { logDebug, saveCaptures } from "@/lib/debug/ocrLog";
import type { Recognizer, SongProgress } from "@/lib/recognition/recognizer";
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

/** 撮影以外のタブは、タブ名のヘッダーを付ける（撮影はカメラ映像を全面に使う） */
const HEADED_TABS: readonly Tab[] = ["history", "settings"];


export default function App() {
  const { settings, update } = useSettings();
  useSampleUpload(settings);
  const { songs } = useMaster();
  const [tab, setTab] = useState<Tab>("camera");
  const [draft, setDraft] = useState<Draft | null>(null);
  // アプリとして追加する案内。アプリとして開いていないときは、ページを開くたびに自動で出す（追加できる端末のときだけ）。
  // 「あとで」で閉じたら、そのページを開いている間は出さない（開き直すと、また出る）。設定からも開ける
  const installMode = useInstallMode();
  const [installOpen, setInstallOpen] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const autoInstall = settings.onboarded && !installDismissed && (installMode === "native" || installMode === "ios");
  const [busy, setBusy] = useState(false);
  /** 読み取りの中止用。読み取り中だけ入っている */
  const abortRef = useRef<AbortController | null>(null);
  /** 読み取り中の段階。画面に出す */
  const [stage, setStage] = useState<string | null>(null);
  /** 読み取りの途中でわかった、曲の確定状況。画面に出す */
  const [song, setSong] = useState<SongProgress | null>(null);
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
      <Onboarding settings={settings} update={update} viewSize={viewSize} />
    );
  }

  const handleCapture = async (image: Blob, source: "camera" | "import", regions?: Record<GuideKey, Blob>) => {
    setBusy(true);
    setStage("画像を準備しています");
    setSong(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
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
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      saveCaptures(stamp, { full: image, ...(regions ?? {}) });
      logDebug(`撮影（保存: internal/captures/${stamp}_*）: ${source} / 枠で切り出し: ${crops ? "あり" : "なし"} / 分離ページ: ${self.crossOriginIsolated}`);
      // 画像は、読み取りが（中止後に遅れて）終わるまで閉じない
      const task = recognizerRef.current!
        .recognize({ full, regions: crops, onStage: setStage, onSong: setSong, signal: controller.signal })
        .finally(() => {
          full.close();
          if (crops) for (const b of Object.values(crops)) b.close();
        });
      raw = await raceAbort(task, controller.signal).catch((e: unknown) => {
        if (isAbortError(e)) {
          cancelled = true;
          logDebug("読み取りを中止");
          return null;
        }
        logDebug("読み取りに失敗: " + (e instanceof Error ? e.stack ?? e.message : String(e)));
        return null;
      });
      if (!raw && !cancelled) logDebug("読み取り結果なし（何も読めなかった）");
    } finally {
      setBusy(false);
      setStage(null);
      setSong(null);
      abortRef.current = null;
    }
    // 中止したときは、結果の画面を出さず、撮影に戻る
    if (cancelled) return;
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
      {HEADED_TABS.includes(tab) && (
        <header className="border-b border-border pt-[env(safe-area-inset-top)]">
          <h1 className="flex h-12 items-center px-4 text-base font-semibold">{TABS.find((t) => t.id === tab)?.label}</h1>
        </header>
      )}
      <main className="min-h-0 flex-1">
        {tab === "camera" && <CameraView active={draft === null} busy={busy} stage={stage} song={song} layout={settings.layout} layoutAspect={settings.layoutAspect} onViewSize={onViewSize} onCapture={handleCapture} onCancel={() => abortRef.current?.abort()} autoCapture={settings.autoCapture} onLayoutChange={(l) => update({ layout: l })} />}
        {tab === "history" && <HistoryView active />}
        {tab === "settings" && <SettingsView settings={settings} update={update} viewSize={viewSize} installable={installMode !== "installed"} onOpenInstall={() => setInstallOpen(true)} />}
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
      <Toaster position="top-center" theme="dark" offset="calc(env(safe-area-inset-top) + 0.75rem)" toastOptions={{ classNames: { toast: "!border-border !bg-card !text-foreground", description: "!text-muted-foreground" } }} />
      {(autoInstall || installOpen) && (
        <InstallDialog
          mode={installMode}
          onClose={() => {
            setInstallOpen(false);
            setInstallDismissed(true);
          }}
        />
      )}
      {draft && <ResultDrawer key={draft.id} draft={draft} songs={songs} settings={settings} onClose={() => setDraft(null)} />}
    </div>
  );
}
