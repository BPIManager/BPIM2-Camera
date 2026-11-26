import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import App from "./App";

// iOS の Safari は user-scalable=no を無視するので、ピンチの開始そのものを止める
document.addEventListener("gesturestart", (e) => e.preventDefault());
// デスクトップの Ctrl + ホイールでの拡大も止める
document.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
