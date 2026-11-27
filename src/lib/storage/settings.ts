import { DEFAULT_SYNC_TARGET, isSyncTarget, type SyncTarget } from "@/lib/bpi/syncTarget";
import type { OcrBenchmarkResult } from "@/lib/recognition/benchmark";
import type { OcrBackend } from "@/lib/recognition/ocrSetup";
import { isValidRect } from "@/lib/vision/guideEdit";
import { GUIDE_KEYS, inferSide, migrateLegacyLayout, type CustomGuides, type GuideLayout, type NormRect } from "@/lib/vision/guides";

export type PlaySide = "1P" | "2P";

export interface Settings {
  /** キャリブレーションした撮影枠（1P/2P どちら側かも、この位置が表す）。未設定なら既定値を使う */
  layout: GuideLayout | null;
  /** 枠の基準にした写真の縦横比（幅 / 高さ）。枠はこの写真に対する割合。layout が null なら null */
  layoutAspect: number | null;
  autoCapture: boolean;
  /** 撮影に使うカメラの deviceId。未選択（null）なら背面カメラ */
  cameraId: string | null;
  /** デバッグモード。オンなら、設定画面の下で OCR の読み取り結果（JSON）を確認できる */
  debugMode: boolean;
  saveToCameraRoll: boolean;
  /** BPIM2 にスコアを保存する先の既定（最新バージョン / INFINITAS）。結果画面で、1 件ごとに変えられる */
  syncTarget: SyncTarget;
  shareImage: "photo" | "card";
  shareTemplate: string;
  statsConsent: boolean | null;
  statsIncludeImage: boolean;
  deviceId: string;
  onboarded: boolean;
  /** 利用規約・プライバシーポリシーに同意した時刻（ms）。未同意は null */
  termsAcceptedAt: number | null;
  /** セットアップウィザードの現在位置。途中で閉じても続きから再開する */
  onboardStep: number;
  /** 読み取りの処理（GPU / CPU）。未設定（ベンチマーク前）なら、WebGPU が使えれば GPU */
  ocrBackend: OcrBackend | null;
  /** 最後に行ったベンチマークの結果 */
  ocrBenchmark: OcrBenchmarkResult | null;
  /** プレーサイド。auto は、枠の配置（スコア欄の枠が左右どちらか）から推定する */
  playSide: PlaySide | "auto";
}

const KEY = "bpim2-camera:settings";

export function defaultSettings(): Settings {
  return {
    layout: null,
    layoutAspect: null,
    autoCapture: true,
    cameraId: null,
    debugMode: false,
    saveToCameraRoll: true,
    syncTarget: DEFAULT_SYNC_TARGET,
    shareImage: "photo",
    shareTemplate: "標準",
    statsConsent: null,
    statsIncludeImage: true,
    deviceId: crypto.randomUUID(),
    onboarded: false,
    termsAcceptedAt: null,
    onboardStep: 0,
    ocrBackend: null,
    ocrBenchmark: null,
    playSide: "auto",
  };
}

export function loadSettings(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): Settings {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Settings> & { playSide?: PlaySide; guides?: unknown };
      const { playSide, guides, ...rest } = stored;
      // 旧版のプレーサイド（1P・2P）は、新しい設定にそのまま引き継ぐ
      const parsed = { ...defaultSettings(), ...rest };
      // 旧版はプレーサイドと 1P/2P 別の枠を持っていた。新しい layout がなければそこから移す
      const layout = sanitizeLayout(parsed.layout) ?? migrateLegacyLayout(playSide === "2P" ? "2P" : "1P", sanitizeGuides(guides));
      const aspect = typeof parsed.layoutAspect === "number" && parsed.layoutAspect > 0.2 && parsed.layoutAspect < 5 ? parsed.layoutAspect : null;
      // 縦横比が分からない枠は、旧来どおり表示領域全体への割合として扱う
      // 壊れた値は既定に戻す
      return { ...parsed, layout, layoutAspect: layout ? aspect : null, syncTarget: isSyncTarget(parsed.syncTarget) ? parsed.syncTarget : DEFAULT_SYNC_TARGET, cameraId: typeof parsed.cameraId === "string" && parsed.cameraId ? parsed.cameraId : null, ocrBackend: parsed.ocrBackend === "gpu" || parsed.ocrBackend === "cpu" ? parsed.ocrBackend : null, playSide: playSide === "1P" || playSide === "2P" ? playSide : "auto" };
    }
  } catch {
    /* 壊れた値や private モードでは既定値で動かす */
  }
  const fresh = defaultSettings();
  saveSettings(fresh, storage);
  return fresh;
}

export function saveSettings(s: Settings, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくてもセッション内では動く */
  }
}

/** 使うプレーサイド。設定が自動なら、枠の配置から推定する（キャリブレーション前は 1P） */
export function resolvePlaySide(s: Pick<Settings, "playSide" | "layout">): PlaySide {
  if (s.playSide !== "auto") return s.playSide;
  return s.layout ? inferSide(s.layout) : "1P";
}

/** 3 枠すべてが有効なときだけ採用する。壊れていれば null（既定値に戻す） */
function sanitizeLayout(l: unknown): GuideLayout | null {
  if (!l || typeof l !== "object") return null;
  const r = l as Record<string, unknown>;
  return GUIDE_KEYS.every((k) => isValidRect(r[k])) ? (l as GuideLayout) : null;
}

/** 旧版の保存値：壊れた枠や範囲外の枠は捨て、有効な枠だけを残す（古い設定の 2 枠でも読める） */
function sanitizeGuides(g: unknown): CustomGuides {
  const out: CustomGuides = {};
  for (const side of ["1P", "2P"] as const) {
    const l = (g as Record<string, Record<string, unknown> | undefined> | undefined)?.[side];
    if (!l) continue;
    const valid: Partial<GuideLayout> = {};
    for (const key of GUIDE_KEYS) if (isValidRect(l[key])) valid[key] = l[key] as NormRect;
    if (Object.keys(valid).length > 0) out[side] = valid;
  }
  return out;
}
