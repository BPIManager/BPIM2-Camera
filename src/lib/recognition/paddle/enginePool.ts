import type { OcrEngine, OcrImage, OcrLine } from "./engine";

type Task = { image: OcrImage; resolve: (l: OcrLine[]) => void; reject: (e: unknown) => void };

/**
 * 複数のエンジン（Worker）を 1 つのエンジンとして使う。読み取りは、空いているエンジンに、頼まれた順に渡す。
 * 1 つのエンジンが同時に読むのは 1 件だけ（Worker の中で順番待ちさせない）。そのため、まだ始まっていない読み取りは取り消せる。
 * エンジン 1 つでも、先読みを取り消せるようにするために使う。
 */
export class EnginePool implements OcrEngine {
  private readonly busy: boolean[];
  private queue: Task[] = [];

  constructor(private readonly engines: readonly OcrEngine[]) {
    this.busy = engines.map(() => false);
  }

  readLines(image: OcrImage): Promise<OcrLine[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ image, resolve, reject });
      this.pump();
    });
  }

  /** まだ始まっていない読み取りを取り消す（失敗にする）。先読みが要らなくなったときに使う */
  cancelPending(): void {
    const dropped = this.queue;
    this.queue = [];
    for (const t of dropped) t.reject(new DOMException("取り消し", "AbortError"));
  }

  private pump(): void {
    for (let i = 0; i < this.engines.length && this.queue.length > 0; i++) {
      if (this.busy[i]) continue;
      const task = this.queue.shift()!;
      this.busy[i] = true;
      this.engines[i]!.readLines(task.image)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.busy[i] = false;
          this.pump();
        });
    }
  }
}
