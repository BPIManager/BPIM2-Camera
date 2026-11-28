import { afterEach, describe, expect, it, vi } from "vitest";
import { OcrTimeoutError, WorkerOcrEngine } from "@/lib/recognition/paddle/workerEngine";

/** 返事の仕方を決められる、偽の Worker。hang が true の間は、読み取りに返事をしない */
class FakeWorker {
  static created: FakeWorker[] = [];
  /** 作った時点から返事をしない */
  static hangNew = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  hang = FakeWorker.hangNew;
  constructor() {
    FakeWorker.created.push(this);
  }
  postMessage(msg: { id: number; type: string }) {
    if (msg.type === "config" || this.hang) return;
    queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, lines: [{ text: `w${FakeWorker.created.indexOf(this)}`, confidence: 99, box: [] }] } } as unknown as MessageEvent));
  }
  terminate() {
    this.terminated = true;
  }
}

const engine = () => new WorkerOcrEngine(() => new FakeWorker() as unknown as Worker, {}, 1000);

afterEach(() => {
  FakeWorker.created = [];
  FakeWorker.hangNew = false;
  vi.useRealTimers();
});

describe("OCR の Worker が返事をしないとき", () => {
  it("モデルの読み込みが済んだあとで上限を過ぎたら、Worker を作り直して 1 回だけ読み直す", async () => {
    vi.useFakeTimers();
    const e = engine();
    await e.warmUp();
    FakeWorker.created[0]!.hang = true;
    const read = e.readLines(new ArrayBuffer(4));
    await vi.advanceTimersByTimeAsync(1000);
    const lines = await read;
    expect(FakeWorker.created).toHaveLength(2);
    expect(FakeWorker.created[0]!.terminated).toBe(true);
    expect(lines[0]!.text).toBe("w1");
  });

  it("作り直した Worker も返事をしなければ、上限は設けずに待つ（モデルの読み込みからやり直すため）", async () => {
    vi.useFakeTimers();
    const e = engine();
    await e.warmUp();
    FakeWorker.created[0]!.hang = true;
    let settled = false;
    const read = e.readLines(new ArrayBuffer(4)).finally(() => (settled = true));
    FakeWorker.hangNew = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWorker.created).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    e.dispose();
    await expect(read).rejects.toThrow("disposed");
  });

  it("モデルの読み込み前（最初の読み取り）は、時間がかかっても待つ", async () => {
    vi.useFakeTimers();
    const e = engine();
    FakeWorker.hangNew = true;
    const read = e.readLines(new ArrayBuffer(4));
    let settled = false;
    void read.finally(() => (settled = true)).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    expect(FakeWorker.created).toHaveLength(1);
    e.dispose();
    await expect(read).rejects.not.toBeInstanceOf(OcrTimeoutError);
  });
});
