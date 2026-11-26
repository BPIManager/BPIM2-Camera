import { isValidRect } from "@/lib/vision/guideEdit";
import { GUIDE_KEYS, type CustomGuides, type GuideLayout, type NormRect } from "@/lib/vision/guides";

export type PlaySide = "1P" | "2P";

export interface Settings {
  /** どちら側でプレーするか。リザルト画面のレイアウトが左右反転するため読み取りに使う */
  playSide: PlaySide;
  /** ユーザーが調整した撮影枠（1P/2P 別）。未調整の側は既定値を使う */
  guides: CustomGuides;
  autoCapture: boolean;
  saveToCameraRoll: boolean;
  shareImage: "photo" | "card";
  shareTemplate: string;
  statsConsent: boolean | null;
  statsIncludeImage: boolean;
  registerToBpim2: boolean;
  deviceId: string;
  onboarded: boolean;
}

const KEY = "bpim2-camera:settings";

export function defaultSettings(): Settings {
  return {
    playSide: "1P",
    guides: {},
    autoCapture: true,
    saveToCameraRoll: true,
    shareImage: "photo",
    shareTemplate: "標準",
    statsConsent: null,
    statsIncludeImage: true,
    registerToBpim2: false,
    deviceId: crypto.randomUUID(),
    onboarded: false,
  };
}

export function loadSettings(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): Settings {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed = { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) };
      return { ...parsed, guides: sanitizeGuides(parsed.guides) };
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

/** 壊れた枠や範囲外の枠は捨てて既定値に戻す。有効な枠だけを残す（古い設定の 2 枠でも読める） */
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
