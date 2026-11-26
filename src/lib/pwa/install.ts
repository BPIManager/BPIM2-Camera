import { useSyncExternalStore } from "react";

/**
 * アプリとして追加する方法は、端末で違う。
 * - installed: すでにアプリとして開いている（案内は不要）
 * - native: Chrome 系。ブラウザの「インストール」ダイアログをアプリから開ける
 * - ios: iOS の Safari。共有メニューから「ホーム画面に追加」する（アプリからは開けない）
 * - manual: それ以外。ブラウザのメニューから追加してもらう（自動の案内は出さない）
 */
export type InstallMode = "installed" | "native" | "ios" | "manual";

export function installModeOf(input: { standalone: boolean; ios: boolean; hasPrompt: boolean }): InstallMode {
  if (input.standalone) return "installed";
  if (input.hasPrompt) return "native";
  if (input.ios) return "ios";
  return "manual";
}

/** Chrome の beforeinstallprompt のイベント（型が標準にないので、使う部分だけ） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// ブラウザは、読み込み直後にインストールの許可イベントを 1 回だけ出す。案内を出すときまで取っておく
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const snapshot = (): InstallMode => (installed ? "installed" : installModeOf({ standalone: isStandalone(), ios: isIos(), hasPrompt: deferred !== null }));

/** いまの端末での、アプリとして追加する方法。許可イベントが届いたら更新される */
export const useInstallMode = (): InstallMode => useSyncExternalStore(subscribe, snapshot, () => "manual");

/** ブラウザのインストールダイアログを開く（native のとき）。結果を返す */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const ev = deferred;
  deferred = null; // 1 回しか使えない
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  notify();
  return outcome;
}
