import { useCallback, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "@/lib/storage/settings";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  return { settings, update };
}
