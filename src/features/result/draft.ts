import type { RawResult } from "@/lib/domain/types";
import type { Resolution } from "@/lib/recognition/resolve";

/** 撮影・取り込み 1 回分の読み取り途中の状態 */
export interface Draft {
  id: string;
  image: Blob;
  source: "camera" | "import";
  raw: RawResult | null;
  resolution: Resolution | null;
}
