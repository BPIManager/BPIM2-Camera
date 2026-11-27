import { Camera, History, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "camera" | "history" | "settings";

export const TABS: readonly { id: Tab; label: string; Icon: typeof Camera }[] = [
  { id: "camera", label: "撮影", Icon: Camera },
  { id: "history", label: "履歴", Icon: History },
  { id: "settings", label: "設定", Icon: SettingsIcon },
];

/** 画面下のタブ */
export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="grid grid-cols-3 border-t border-border pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={tab === id}
          className={cn("flex flex-col items-center gap-1 py-2 text-xs transition-colors", tab === id ? "text-primary" : "text-muted-foreground")}
        >
          <Icon className="size-5" />
          {label}
        </button>
      ))}
    </nav>
  );
}
