import cpuRuntime from "virtual:ort-runtime-cpu";
import gpuRuntime from "virtual:ort-runtime-gpu";
import type { OcrBackend } from "./ocrSetup";

/**
 * OCR に使う、取得してキャッシュするファイル（ランタイムの WASM とモデル）の一覧。
 * アプリが Cache Storage（ASSET_CACHE）で管理し、設定画面から、いまの設定で使わないものを削除できる。
 */

/** モデルの組。small は本読み、tiny は自動撮影の下見 */
export type ModelSet = "small" | "tiny";

export interface ModelFiles {
  detection: string;
  recognition: string;
  charactersDictionary: string;
}

/**
 * 自前で配信するモデル（pnpm models:fetch で public/models/paddle に置く）。
 * small は WebGPU でも読めるよう ONNX 形式（.ort は CPU 向けに最適化済みで、WebGPU では読めない）。tiny は CPU だけで読むので .ort
 */
export const MODEL_FILES: Record<ModelSet, ModelFiles> = {
  small: {
    detection: "/models/paddle/PP-OCRv6_small_det.onnx",
    recognition: "/models/paddle/PP-OCRv6_small_rec.onnx",
    charactersDictionary: "/models/paddle/ppocrv6_dict.txt",
  },
  tiny: {
    detection: "/models/paddle/PP-OCRv6_tiny_det.ort",
    recognition: "/models/paddle/PP-OCRv6_tiny_rec.ort",
    charactersDictionary: "/models/paddle/ppocrv6_tiny_dict.txt",
  },
};

const HF = "https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main";
/** 自前のモデルが置かれていないとき（開発中など）の取得先 */
export const MODEL_FALLBACK: Record<ModelSet, ModelFiles> = {
  small: {
    detection: `${HF}/detection/PP-OCRv6_small_det.onnx`,
    recognition: `${HF}/recognition/PP-OCRv6_small_rec.onnx`,
    charactersDictionary: `${HF}/recognition/ppocrv6_dict.txt`,
  },
  tiny: {
    detection: `${HF}/detection/ort/PP-OCRv6_tiny_det.ort`,
    recognition: `${HF}/recognition/ort/PP-OCRv6_tiny_rec.ort`,
    charactersDictionary: `${HF}/recognition/ppocrv6_tiny_dict.txt`,
  },
};

/** onnxruntime-web のランタイム（WASM）。CPU 用は CPU だけの版、GPU 用は WebGPU も使える版 */
export const RUNTIME_URL: Record<OcrBackend, string> = { cpu: cpuRuntime, gpu: gpuRuntime };

/** アプリが管理するキャッシュ */
export const ASSET_CACHE = "bpim2-ocr-assets-v1";
/** 以前の版が使っていたキャッシュ（Service Worker の実行時キャッシュ）。中身はもう使わない */
export const LEGACY_CACHES = ["ocr-assets"] as const;

/** 削除の判断に使う、いまの設定 */
export interface AssetContext {
  /** 使っている読み取りの処理 */
  backend: OcrBackend;
  autoCapture: boolean;
}

export interface AssetGroup {
  id: "runtime-gpu" | "runtime-cpu" | "model-small" | "model-tiny";
  label: string;
  description: string;
  /** このグループのファイル名（URL の最後の部分。取得先が違っても同じファイルとみなす） */
  files: readonly string[];
  needed: (ctx: AssetContext) => boolean;
}

const fileName = (url: string) => url.split("?")[0]!.split("/").pop()!;
const modelFiles = (set: ModelSet) => Object.values(MODEL_FILES[set]).map(fileName);

export const ASSET_GROUPS: readonly AssetGroup[] = [
  { id: "model-small", label: "読み取りのモデル", description: "撮影した画像を読むのに使います", files: modelFiles("small"), needed: () => true },
  { id: "runtime-gpu", label: "GPU 用のランタイム", description: "読み取りの処理が GPU のときに使います", files: [fileName(RUNTIME_URL.gpu)], needed: (c) => c.backend === "gpu" },
  {
    id: "runtime-cpu",
    label: "CPU 用のランタイム",
    description: "読み取りの処理が CPU のときに使います",
    files: [fileName(RUNTIME_URL.cpu)],
    // 開発サーバーでは、CPU も GPU 用のランタイムで動く（同じファイル）
    needed: (c) => c.backend === "cpu" || RUNTIME_URL.cpu === RUNTIME_URL.gpu,
  },
  { id: "model-tiny", label: "自動撮影の下見のモデル", description: "自動撮影がオンのときに使います", files: modelFiles("tiny"), needed: (c) => c.autoCapture },
];

/** URL が、どのグループのファイルか */
export function groupOf(url: string): AssetGroup | undefined {
  const name = fileName(url);
  return ASSET_GROUPS.find((g) => g.files.includes(name));
}
