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
  /** true の間は、読み取りの返事を溜めておく（release で 1 件ずつ返す。同時に何件頼まれたかを調べる用） */
  holdReplies = false;
  held: number[] = [];
  constructor() {
    FakeWorker.created.push(this);
  }
  postMessage(msg: { id: number; type: string }) {
    if (msg.type === "config" || this.hang) return;
    if (this.holdReplies && msg.type === "read") {
      this.held.push(msg.id);
      return;
    }
    queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, lines: [{ text: `w${FakeWorker.created.indexOf(this)}`, confidence: 99, box: [] }] } } as unknown as MessageEvent));
  }
  terminate() {
    this.terminated = true;
  }
  /** 溜めた返事を、先頭から 1 件返す */
  release() {
    const id = this.held.shift()!;
    this.onmessage?.({ data: { id, lines: [{ text: `r${id}`, confidence: 99, box: [] }] } } as unknown as MessageEvent);
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

describe("同時に頼まれた読み取り", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("Worker には 1 件ずつ頼み、頼まれた順に返す（同時に 2 件読ませない）", async () => {
    const e = engine();
    await e.warmUp();
    const w = FakeWorker.created[0]!;
    w.holdReplies = true;
    const a = e.readLines(new ArrayBuffer(4));
    const b = e.readLines(new ArrayBuffer(4));
    const c = e.readLines(new ArrayBuffer(4));
    await tick();
    expect(w.held).toHaveLength(1);
    w.release();
    expect((await a)[0]!.text).toBe("r2");
    await tick();
    expect(w.held).toHaveLength(1);
    w.release();
    await b;
    await tick();
    expect(w.held).toHaveLength(1);
    w.release();
    expect((await c)[0]!.text).toBe("r4");
  });

  it("順番待ちの途中で止めたら、待っていた読み取りは失敗にし、Worker を作り直さない", async () => {
    const e = engine();
    await e.warmUp();
    FakeWorker.created[0]!.holdReplies = true;
    const a = e.readLines(new ArrayBuffer(4));
    const b = e.readLines(new ArrayBuffer(4));
    await tick();
    e.dispose();
    await expect(a).rejects.toThrow("disposed");
    await expect(b).rejects.toThrow("disposed");
    expect(FakeWorker.created).toHaveLength(1);
  });
});
