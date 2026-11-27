import { useCallback, useState } from "react";
import { Toaster } from "sonner";
import CameraView from "@/features/camera/CameraView";
import HistoryView from "@/features/history/HistoryView";
import InstallDialog from "@/features/install/InstallDialog";
import Onboarding from "@/features/onboarding/Onboarding";
import ResultDrawer from "@/features/result/ResultDrawer";
import SettingsView from "@/features/settings/SettingsView";
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

/** 撮影以外のタブは、タブ名のヘッダーを付ける（撮影はカメラ映像を全面に使う） */
const HEADED_TABS: readonly Tab[] = ["history", "settings"];

/** 画面の骨組み。設定・OCR・読み取りの流れは、それぞれのフックに任せ、ここでは画面を組み立てるだけにする */
export default function App() {
  const { settings, update } = useSettings();
  useSampleUpload(settings);
  useDebugMode(settings.debugMode);
  const { songs } = useMaster();
  // セットアップ中も、OCR のモデルを読み込んでおく
  const getRecognizer = useOcrEngine(songs);
  const reader = useCaptureReader({ getRecognizer, songs, settings });
  const install = useInstallPrompt(settings.onboarded);
  const [tab, setTab] = useState<Tab>("camera");
  // カメラ表示領域の大きさ。設定の枠調整が同じ縦横比で表示するために保持する
  const [viewSize, setViewSize] = useState<Size>({ width: window.innerWidth, height: Math.max(200, window.innerHeight - 170) });
  const onViewSize = useCallback((s: Size) => s.width > 0 && setViewSize(s), []);

  if (!settings.onboarded) return <Onboarding settings={settings} update={update} viewSize={viewSize} />;

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
            layout={settings.layout}
            layoutAspect={settings.layoutAspect}
            onViewSize={onViewSize}
            onCapture={reader.read}
            onCancel={reader.cancel}
            autoCapture={settings.autoCapture}
            cameraId={settings.cameraId}
            onLayoutChange={(l) => update({ layout: l })}
          />
        )}
        {tab === "history" && <HistoryView active />}
        {tab === "settings" && <SettingsView settings={settings} update={update} viewSize={viewSize} installable={install.installable} onOpenInstall={install.show} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
      <UnsavedImageDialog image={reader.unsaved} onClose={reader.clearUnsaved} />
      <Toaster position="top-center" theme="dark" offset="calc(env(safe-area-inset-top) + 0.75rem)" toastOptions={{ classNames: { toast: "!border-border !bg-card !text-foreground", description: "!text-muted-foreground" } }} />
      {install.open && <InstallDialog mode={install.mode} onClose={install.close} />}
      {reader.draft && <ResultDrawer key={reader.draft.id} draft={reader.draft} songs={songs} settings={settings} onClose={reader.closeDraft} />}
    </div>
  );
}
