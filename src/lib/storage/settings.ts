export type PlaySide = "1P" | "2P";

export interface Settings {
  /** どちら側でプレーするか。リザルト画面のレイアウトが左右反転するため読み取りに使う */
  playSide: PlaySide;
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
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) };
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
