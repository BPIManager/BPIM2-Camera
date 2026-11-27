import { useEffect } from "react";
import { setDebugMode } from "@/lib/debug/ocrLog";

/** デバッグモード。オンの間だけ、読み取り結果を貯める（設定画面で見る） */
export function useDebugMode(on: boolean): void {
  useEffect(() => {
    setDebugMode(on);
  }, [on]);
}
