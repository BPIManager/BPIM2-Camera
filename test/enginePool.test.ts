import { describe, expect, it } from "vitest";
import { EnginePool } from "@/lib/recognition/paddle/enginePool";
import type { OcrEngine, OcrLine } from "@/lib/recognition/paddle/engine";

/** 呼ばれた順を記録し、手で終わらせられるエンジン */
function manualEngine(name: string, log: string[]) {
  const waiting: (() => void)[] = [];
  const engine: OcrEngine = {
    readLines: (image) =>
      new Promise<OcrLine[]>((resolve) => {
        log.push(`${name}:${new Uint8Array(image as ArrayBuffer)[0]}`);
        waiting.push(() => resolve([{ text: name, confidence: 100, box: { x: 0, y: 0, width: 1, height: 1 } }]));
      }),
  };
  return { engine, finish: () => waiting.shift()?.() };
}
const img = (n: number) => new Uint8Array([n]).buffer;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("EnginePool", () => {
  it("空いているエンジンに、頼まれた順に 1 件ずつ渡す", async () => {
    const log: string[] = [];
    const a = manualEngine("a", log);
    const b = manualEngine("b", log);
    const pool = new EnginePool([a.engine, b.engine]);
    const reads = [1, 2, 3].map((n) => pool.readLines(img(n)));
    await tick();
    // 3 件目は、どちらかが空くまで待つ
    expect(log).toEqual(["a:1", "b:2"]);
    b.finish();
    await tick();
    expect(log).toEqual(["a:1", "b:2", "b:3"]);
    a.finish();
    b.finish();
    expect((await Promise.all(reads)).map((l) => l[0]!.text)).toEqual(["a", "b", "b"]);
  });

  it("まだ始まっていない読み取りは取り消せる（始まったものは、そのまま終わる）", async () => {
    const log: string[] = [];
    const a = manualEngine("a", log);
    const pool = new EnginePool([a.engine]);
    const first = pool.readLines(img(1));
    const second = pool.readLines(img(2));
    await tick();
    pool.cancelPending();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    a.finish();
    expect((await first)[0]!.text).toBe("a");
    expect(log).toEqual(["a:1"]);
  });
});
