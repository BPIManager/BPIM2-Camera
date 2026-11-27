import { useState } from "react";
import { useInstallMode } from "@/lib/pwa/install";

/**
 * ホーム画面への追加の案内。アプリとして開いていないときは、ページを開くたびに自動で出す（追加できる端末で、セットアップが済んでいるときだけ）。
 * 「あとで」で閉じたら、そのページを開いている間は出さない（開き直すと、また出る）。設定からも開ける
 */
export function useInstallPrompt(onboarded: boolean) {
  const mode = useInstallMode();
  const [requested, setRequested] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const auto = onboarded && !dismissed && (mode === "native" || mode === "ios");
  return {
    mode,
    /** まだアプリとして開いていない（追加できる） */
    installable: mode !== "installed",
    open: auto || requested,
    show: () => setRequested(true),
    close: () => {
      setRequested(false);
      setDismissed(true);
    },
  };
}
