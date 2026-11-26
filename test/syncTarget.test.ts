import { describe, expect, it } from "vitest";
import { LATEST_VERSION } from "@/lib/bpi/client";
import { SYNC_TARGETS, isSyncTarget, syncTargetLabel, syncVersionOf } from "@/lib/bpi/syncTarget";
import { defaultSettings, loadSettings } from "@/lib/storage/settings";

const mem = (value: unknown) => {
  const m = new Map<string, string>([["bpim2-camera:settings", JSON.stringify(value)]]);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("BPIM2 の同期先", () => {
  it("選べるのは最新バージョンと INFINITAS だけ。API に渡すバージョンは、最新は LATEST_VERSION、INFINITAS は INF", () => {
    expect(SYNC_TARGETS.map((t) => t.id)).toEqual(["latest", "inf"]);
    expect(syncVersionOf("latest")).toBe(LATEST_VERSION);
    expect(syncVersionOf("inf")).toBe("INF");
    expect(syncTargetLabel("latest")).toContain(LATEST_VERSION);
    expect(syncTargetLabel("inf")).toBe("INFINITAS");
  });

  it("同期先の判定", () => {
    expect(isSyncTarget("latest")).toBe(true);
    expect(isSyncTarget("inf")).toBe(true);
    expect(isSyncTarget("33")).toBe(false);
    expect(isSyncTarget(null)).toBe(false);
  });

  it("設定の既定は最新バージョン。保存された値は読み込み、壊れた値・古い設定（項目なし）は既定に戻す", () => {
    expect(defaultSettings().syncTarget).toBe("latest");
    expect(loadSettings(mem({ syncTarget: "inf" })).syncTarget).toBe("inf");
    expect(loadSettings(mem({ syncTarget: "32" })).syncTarget).toBe("latest");
    expect(loadSettings(mem({ autoCapture: false })).syncTarget).toBe("latest");
  });
});
