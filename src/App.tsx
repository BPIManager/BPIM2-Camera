import { useCallback, useState } from "react";
import { Toaster } from "sonner";
import CameraView from "@/features/camera/CameraView";
import ImportFrameEditor from "@/features/camera/ImportFrameEditor";
import HistoryView from "@/features/history/HistoryView";
import InstallDialog from "@/features/install/InstallDialog";
import Onboarding from "@/features/onboarding/Onboarding";
import ResultDrawer from "@/features/result/ResultDrawer";
import SettingsView from "@/features/settings/SettingsView";
import DownloadProgress from "@/features/ocr/DownloadProgress";
import TabBar, { TABS, type Tab } from "@/features/shell/TabBar";
import UnsavedImageDialog from "@/features/shell/UnsavedImageDialog";
import { useCaptureReader } from "@/hooks/useCaptureReader";
import { useDebugMode } from "@/hooks/useDebugMode";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useMaster } from "@/hooks/useMaster";
import { useOcrEngine } from "@/hooks/useOcrEngine";
import { useSampleUpload } from "@/hooks/useSampleUpload";
import { useSettings } from "@/hooks/useSettings";
import type { Size } from "@/lib/vision/framing";
import { resolveLayout } from "@/lib/vision/guides";
import { needsPlaySidePrompt, resolvePlaySide } from "@/lib/storage/settings";
import PlaySideDialog from "@/features/shell/PlaySideDialog";

/** 撮影以外のタブは、タブ名のヘッダーを付ける（撮影はカメラ映像を全面に使う） */
const HEADED_TABS: readonly Tab[] = ["history", "settings"];

/** 画面の骨組み。設定・OCR・読み取りの流れは、それぞれのフックに任せ、ここでは画面を組み立てるだけにする */
export default function App() {
  const { settings, update } = useSettings();
  useSampleUpload(settings);
  useDebugMode(settings.debugMode);
  const { songs } = useMaster();
  // セットアップ中も、OCR のモデルを読み込んでおく（処理を決めるベンチマークの前は、まだ作らない）
  const { getRecognizer, getEngine, backend } = useOcrEngine(songs, settings.ocrBackend, settings.onboarded || settings.ocrBackend !== null);
  const reader = useCaptureReader({ getRecognizer, getEngine, songs, settings });
  const install = useInstallPrompt(settings.onboarded);
  const [tab, setTab] = useState<Tab>("camera");
  // 取り込んだ画像。枠を合わせている間だけ入っている（合わせたら、撮影と同じく枠の中を読む）
  const [importing, setImporting] = useState<Blob | null>(null);
  // カメラ表示領域の大きさ。設定の枠調整が同じ縦横比で表示するために保持する
  const [viewSize, setViewSize] = useState<Size>({ width: window.innerWidth, height: Math.max(200, window.innerHeight - 170) });
  const onViewSize = useCallback((s: Size) => s.width > 0 && setViewSize(s), []);

  // モデルの取得の進み具合は、セットアップ中（ベンチマーク）も出す
  if (!settings.onboarded)
    return (
      <>
        <Onboarding settings={settings} update={update} viewSize={viewSize} />
        <DownloadProgress />
      </>
    );

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {HEADED_TABS.includes(tab) && (
        <header className="border-b border-border pt-[env(safe-area-inset-top)]">
          <h1 className="flex h-12 items-center px-4 text-base font-semibold">{TABS.find((t) => t.id === tab)?.label}</h1>
        </header>
      )}
      <main className="min-h-0 flex-1">
        {tab === "camera" && (
          <CameraView
            active={reader.draft === null}
            busy={reader.busy}
            stage={reader.stage}
            song={reader.song}
            layout={resolveLayout(settings.layout, resolvePlaySide(settings))}
            layoutAspect={settings.layoutAspect}
            onViewSize={onViewSize}
            onCapture={reader.read}
            onImport={setImporting}
            onCancel={reader.cancel}
            autoCapture={settings.autoCapture}
            cameraId={settings.cameraId}
            onLayoutChange={(l) => update({ layout: l })}
            ocrBackend={backend}
          />
        )}
        {tab === "history" && <HistoryView active />}
        {tab === "settings" && <SettingsView settings={settings} update={update} viewSize={viewSize} installable={install.installable} onOpenInstall={install.show} ocrBackend={backend} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
      <UnsavedImageDialog image={reader.unsaved} onClose={reader.clearUnsaved} />
      <Toaster position="top-center" theme="dark" offset="calc(env(safe-area-inset-top) + 0.75rem)" toastOptions={{ classNames: { toast: "!border-border !bg-card !text-foreground", description: "!text-muted-foreground" } }} />
      <DownloadProgress />
      {importing && (
        <ImportFrameEditor
          image={importing}
          fallback={resolveLayout(settings.layout, resolvePlaySide(settings))}
          playSide={settings.playSide}
          getEngine={getEngine}
          songs={songs}
          onCancel={() => setImporting(null)}
          onConfirm={(regions, frames) => {
            setImporting(null);
            void reader.read(importing, "import", regions, frames);
          }}
        />
      )}
      {/* これまで使っていた人に、プレーサイドを 1 回だけ選んでもらう。ホーム画面への追加の案内より先に出す */}
      {needsPlaySidePrompt(settings) && <PlaySideDialog onChoose={(playSide) => update({ playSide, playSideChosen: true })} />}
      {install.open && !needsPlaySidePrompt(settings) && <InstallDialog mode={install.mode} onClose={install.close} />}
      {reader.draft && <ResultDrawer key={reader.draft.id} draft={reader.draft} songs={songs} settings={settings} onClose={reader.closeDraft} />}
    </div>
  );
}
