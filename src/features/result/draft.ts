import type { RawResult } from "@/lib/domain/types";
import type { Resolution } from "@/lib/recognition/resolve";

/** 撮影・取り込み 1 回分の読み取り途中の状態 */
export interface Draft {
  id: string;
  image: Blob;
  source: "camera" | "import";
  /** ガイド枠で切り出したスコア部と曲名帯（カメラ撮影のみ）。学習サンプルの元 */
  regions?: { score: Blob; title: Blob };
  raw: RawResult | null;
  resolution: Resolution | null;
}
