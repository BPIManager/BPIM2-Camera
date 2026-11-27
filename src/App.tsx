import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import ConfirmDialog from "@/components/confirm-dialog";
import { saveImage } from "@/lib/share/save";
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
import { collectReadSample } from "@/lib/training/collect";
import { flushIfEnabled } from "@/lib/training/upload";
import { useSettings } from "@/hooks/useSettings";
import { TesseractRecognizer } from "@/lib/recognition/ocr/tesseractRecognizer";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import { WorkerOcrEngine } from "@/lib/recognition/paddle/workerEngine";
import { EnginePool } from "@/lib/recognition/paddle/enginePool";
import { hasWebGpu } from "@/lib/recognition/paddle/webgpu";
import { isAbortError, raceAbort } from "@/lib/async/abort";
import { logDebug, saveCaptures, setDebugMode } from "@/lib/debug/ocrLog";
import type { OcrTrace, Recognizer, SongProgress } from "@/lib/recognition/recognizer";
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
  // デバッグモード。オンの間だけ、読み取り結果を貯める（設定画面で見る）
  useEffect(() => {
    setDebugMode(settings.debugMode);
  }, [settings.debugMode]);
  const { songs } = useMaster();
  const [tab, setTab] = useState<Tab>("camera");
  const [draft, setDraft] = useState<Draft | null>(null);
  // 読み取りを中止したとき、画像だけ保存するかを確かめる（自動保存がオンのときだけ）。保存は、この確認の操作のあとに行う（iOS は操作の直後でないと共有シートを開けない）
  const [unsaved, setUnsaved] = useState<Blob | null>(null);
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
  const enginesRef = useRef<WorkerOcrEngine[]>([]);
  const recognizerRef = useRef<Recognizer | null>(null);
  const makeRecognizer = (titleWorker: WorkerOcrEngine, passWorker?: WorkerOcrEngine) =>
    // 枠で撮った画像は PaddleOCR、全体画像の取り込みは Tesseract で読む
    new PaddleRecognizer(titleWorker, () => songsRef.current, new TesseractRecognizer(() => songsRef.current), {
      passEngine: passWorker && new EnginePool([passWorker]),
      ahead: passWorker ? Number.POSITIVE_INFINITY : 0,
    });
  if (!recognizerRef.current) {
    const titleWorker = new WorkerOcrEngine();
    enginesRef.current = [titleWorker];
    recognizerRef.current = makeRecognizer(titleWorker);
  }

  // PaddleOCR のモデルを撮影前に読み込んでおく。
  // WebGPU があれば GPU で読む（Worker 1 つ。GPU は 1 つずつしか読めないので、分けても速くならない）。
  // なければ CPU で、曲名と、スコア欄・判定表を、別々の Worker で同時に読む（実機で約 25% 速い）。スコア欄・判定表は先読みし、要らなくなった分は取り消す
  useEffect(() => {
    const [titleWorker] = enginesRef.current;
    if (!titleWorker) return;
    void titleWorker.warmUp().catch(() => undefined);
    void hasWebGpu().then((gpu) => {
      if (gpu || enginesRef.current.length > 1) return;
      const passWorker = new WorkerOcrEngine();
      enginesRef.current.push(passWorker);
      void passWorker.warmUp().catch(() => undefined);
      recognizerRef.current = makeRecognizer(titleWorker, passWorker);
    });
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
    let ocr: OcrTrace | undefined;
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
        .recognize({ full, regions: crops, onStage: setStage, onSong: setSong, onTrace: (t) => (ocr = t), signal: controller.signal })
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
    if (cancelled) {
      if (settings.saveToCameraRoll && source === "camera") setUnsaved(image);
      return;
    }
    const next: Draft = {
      id: crypto.randomUUID(),
      image,
      source,
      regions,
      ocr,
      raw,
      resolution: raw ? resolveResult(raw, songs) : null,
    };
    setDraft(next);
    // 確定を待たず、読み取りが終わった時点で学習サンプルとして貯めて送る（成功・失敗を問わない）
    void collectReadSample(next, settings)
      .then((saved) => (saved ? flushIfEnabled(settings) : null))
      .catch(() => undefined);
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {HEADED_TABS.includes(tab) && (
        <header className="border-b border-border pt-[env(safe-area-inset-top)]">
          <h1 className="flex h-12 items-center px-4 text-base font-semibold">{TABS.find((t) => t.id === tab)?.label}</h1>
        </header>
      )}
      <main className="min-h-0 flex-1">
        {tab === "camera" && <CameraView active={draft === null} busy={busy} stage={stage} song={song} layout={settings.layout} layoutAspect={settings.layoutAspect} onViewSize={onViewSize} onCapture={handleCapture} onCancel={() => abortRef.current?.abort()} autoCapture={settings.autoCapture} cameraId={settings.cameraId} onLayoutChange={(l) => update({ layout: l })} />}
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
      <ConfirmDialog
        open={unsaved !== null}
        onClose={() => setUnsaved(null)}
        title="画像を保存しますか？"
        description="読み取りを中止しました。撮影した画像だけ、保存できます。"
        confirmLabel="保存する"
        cancelLabel="保存しない"
        onConfirm={() => {
          const image = unsaved;
          setUnsaved(null);
          if (image) void saveImage(image, `iidx-${Date.now()}.jpg`);
        }}
      />
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
