import { useEffect } from "react";

/**
 * スマホのキーボードで隠れない大きさに、画面下のシートを合わせるための値を CSS 変数に入れる。
 * --vv-height: 実際に見えている高さ / --kb-inset: キーボード（など）が覆っている下端の高さ
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty("--vv-height", `${vv.height}px`);
      root.style.setProperty("--kb-inset", `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--kb-inset");
    };
  }, []);
}
