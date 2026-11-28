import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import App from "./App";
import { logEvent } from "./lib/debug/ocrLog";

// 開発中は、裏に回した・戻った・エラーを記録する（tailscale serve 経由でスマホから開いたとき、PC の internal/debug.log に貯まる）
if (import.meta.env.DEV) {
  logEvent("app", `起動（${navigator.userAgent}・分離ページ: ${self.crossOriginIsolated}）`);
  document.addEventListener("visibilitychange", () => logEvent("app", `表示: ${document.visibilityState}`));
  window.addEventListener("pagehide", (e) => logEvent("app", `pagehide（persisted: ${e.persisted}）`));
  window.addEventListener("pageshow", (e) => logEvent("app", `pageshow（persisted: ${e.persisted}）`));
  window.addEventListener("error", (e) => logEvent("error", `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => logEvent("error", `unhandledrejection: ${e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)}`));
}

// iOS の Safari は user-scalable=no を無視するので、ピンチの開始そのものを止める
document.addEventListener("gesturestart", (e) => e.preventDefault());
// デスクトップの Ctrl + ホイールでの拡大も止める
document.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
