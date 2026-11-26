import { useState } from "react";
import { Camera, History, Settings as SettingsIcon } from "lucide-react";
import CameraView from "@/features/camera/CameraView";
import HistoryView from "@/features/history/HistoryView";
import Onboarding from "@/features/onboarding/Onboarding";
import type { Draft } from "@/features/result/draft";
import ResultDrawer from "@/features/result/ResultDrawer";
import SettingsView from "@/features/settings/SettingsView";
import { useMaster } from "@/hooks/useMaster";
import { useSettings } from "@/hooks/useSettings";
import { NullRecognizer } from "@/lib/recognition/recognizer";
import { resolveResult } from "@/lib/recognition/resolve";
import { cn } from "@/lib/utils";

type Tab = "camera" | "history" | "settings";

const TABS = [
  { id: "camera", label: "撮影", Icon: Camera },
  { id: "history", label: "履歴", Icon: History },
  { id: "settings", label: "設定", Icon: SettingsIcon },
] as const;

const recognizer = new NullRecognizer();
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

export default function App() {
  const { settings, update } = useSettings();
  const { songs } = useMaster();
  const [tab, setTab] = useState<Tab>("camera");
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!settings.onboarded) {
    return (
      <Onboarding
        ios={isIos}
        standalone={isStandalone}
        onDone={(consent) => update({ onboarded: true, statsConsent: consent })}
      />
    );
  }

  const handleCapture = async (image: Blob, source: "camera" | "import") => {
    const bitmap = await createImageBitmap(image);
    const raw = await recognizer.recognize(bitmap);
    bitmap.close();
    setDraft({
      id: crypto.randomUUID(),
      image,
      source,
      raw,
      resolution: raw ? resolveResult(raw, songs) : null,
    });
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <main className="min-h-0 flex-1">
        {tab === "camera" && <CameraView active={draft === null} onCapture={handleCapture} />}
        {tab === "history" && <HistoryView active />}
        {tab === "settings" && <SettingsView settings={settings} update={update} />}
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
