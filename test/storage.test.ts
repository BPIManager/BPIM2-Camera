import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest } from "@/lib/storage/db";
import { clearHistory, deleteResult, filterResults, listPendingBpi, listResults, saveResult } from "@/lib/storage/history";
import { defaultSettings, loadSettings } from "@/lib/storage/settings";
import { record } from "./fixtures";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTest();
});

describe("history", () => {
  it("新しい順に保存・削除でき、☆10以下の対象外レコードも保存できる", async () => {
    await saveResult(record({ id: "a", createdAt: 1 }));
    await saveResult(record({ id: "b", createdAt: 2, bpiStatus: "pending" }));
    expect((await listResults()).map((r) => r.id)).toEqual(["b", "a"]);
    expect((await listPendingBpi()).map((r) => r.id)).toEqual(["b"]);
    await deleteResult("a");
    expect((await listResults()).map((r) => r.id)).toEqual(["b"]);
    await clearHistory();
    expect(await listResults()).toEqual([]);
  });

  it("曲名で検索できる", () => {
    const rs = [record({ id: "a" })];
    expect(filterResults(rs, "heart")).toHaveLength(1);
    expect(filterResults(rs, "zzz")).toHaveLength(0);
  });
});

describe("settings", () => {
  it("初回は既定値を保存し、2回目以降は同じ端末 ID を返す", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const first = loadSettings(storage);
    expect(first.autoCapture).toBe(true);
    expect(loadSettings(storage).deviceId).toBe(first.deviceId);
    expect(defaultSettings().statsConsent).toBeNull();
  });
});

describe("settings のキャリブレーション", () => {
  const mem = (value: unknown) => {
    const m = new Map<string, string>([["bpim2-camera:settings", JSON.stringify(value)]]);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const ok = { x: 0.1, y: 0.1, width: 0.2, height: 0.1 };

  it("3 枠すべてが正しければ読み込み、壊れていれば null（既定値）に戻す", () => {
    expect(loadSettings(mem({ layout: { score: ok, title: ok, judge: ok } })).layout).toEqual({ score: ok, title: ok, judge: ok });
    expect(loadSettings(mem({ layout: { score: ok, title: ok, judge: { x: 2, y: 0, width: 1, height: 1 } } })).layout).toBeNull();
    expect(loadSettings(mem({ autoCapture: false })).layout).toBeNull();
  });

  it("写真の縦横比は、枠があり妥当なときだけ読み込む（なければ null で、表示領域全体への割合として扱う）", () => {
    const layout = { score: ok, title: ok, judge: ok };
    expect(loadSettings(mem({ layout, layoutAspect: 1.5 })).layoutAspect).toBe(1.5);
    expect(loadSettings(mem({ layout, layoutAspect: 0 })).layoutAspect).toBeNull();
    expect(loadSettings(mem({ layout })).layoutAspect).toBeNull();
    expect(loadSettings(mem({ layoutAspect: 1.5 })).layoutAspect).toBeNull();
  });

  it("旧版の保存値（プレーサイドと 1P/2P 別の枠）から、プレー側の枠を引き継ぐ", () => {
    const s = loadSettings(mem({ playSide: "2P", guides: { "2P": { score: ok, title: ok } } }));
    expect(s.layout?.score).toEqual(ok);
    expect(s.layout?.title).toEqual(ok);
    // 旧版のプレーサイドは、新しいプレーサイドの設定に引き継ぐ
    expect(s.playSide).toBe("2P");
    expect(s).not.toHaveProperty("guides");
  });

  it("旧版で壊れた枠だけは捨てて既定値で補う", () => {
    const s = loadSettings(mem({ guides: { "1P": { score: ok, judge: { x: 2, y: 0, width: 1, height: 1 } } } }));
    expect(s.layout?.score).toEqual(ok);
  });
});

describe("resolvePlaySide", () => {
  it("設定があればそれ。自動なら枠の配置から推定し、キャリブレーション前は 1P", async () => {
    const { resolvePlaySide } = await import("@/lib/storage/settings");
    const { GUIDE_LAYOUTS } = await import("@/lib/vision/guides");
    expect(resolvePlaySide({ playSide: "2P", layout: null })).toBe("2P");
    expect(resolvePlaySide({ playSide: "auto", layout: null })).toBe("1P");
    expect(resolvePlaySide({ playSide: "auto", layout: GUIDE_LAYOUTS["2P"] })).toBe("2P");
  });
});

describe("needsPlaySidePrompt", () => {
  it("セットアップを済ませていて、まだプレーサイドを選んでいない人にだけ確かめる。旧版で 1P/2P を選んでいた人は選んだものとする", async () => {
    const { needsPlaySidePrompt, loadSettings } = await import("@/lib/storage/settings");
    const mem = (value: unknown) => {
      const m = new Map<string, string>([["bpim2-camera:settings", JSON.stringify(value)]]);
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    };
    expect(needsPlaySidePrompt({ onboarded: true, playSideChosen: false })).toBe(true);
    expect(needsPlaySidePrompt({ onboarded: true, playSideChosen: true })).toBe(false);
    expect(needsPlaySidePrompt({ onboarded: false, playSideChosen: false })).toBe(false);
    // これまで使っていた人（プレーサイドの保存値がない）は、自動のままで、まだ選んでいない
    const before = loadSettings(mem({ onboarded: true }));
    expect(before).toMatchObject({ playSide: "auto", playSideChosen: false });
    // 旧版で選んでいた人
    expect(loadSettings(mem({ onboarded: true, playSide: "2P" }))).toMatchObject({ playSide: "2P", playSideChosen: true });
  });
});

describe("結果画面の最初のタブ", () => {
  const mem = (stored: Record<string, unknown>) => ({ getItem: () => JSON.stringify(stored), setItem: () => undefined });

  it("既定は BPI。壊れた値は BPI に戻し、beat-seeker は保存したとおりに読む", () => {
    expect(defaultSettings().resultTab).toBe("bpi");
    expect(loadSettings(mem({ autoCapture: false })).resultTab).toBe("bpi");
    expect(loadSettings(mem({ resultTab: "beat-seeker" })).resultTab).toBe("beat-seeker");
    expect(loadSettings(mem({ resultTab: "ranking" })).resultTab).toBe("bpi");
  });

  it("beat-seeker を選んでいても、連携していなければ BPI を開く（案内しか出ないため）", async () => {
    const { initialResultTab } = await import("@/lib/result/resultTab");
    expect(initialResultTab("beat-seeker", true)).toBe("beat-seeker");
    expect(initialResultTab("beat-seeker", false)).toBe("bpi");
    expect(initialResultTab("bpi", true)).toBe("bpi");
  });
});
