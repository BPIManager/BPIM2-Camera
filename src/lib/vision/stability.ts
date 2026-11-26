import { frameDiff, sharpness, type Gray } from "./frame";

export interface StabilityOptions {
  /** 連続何フレーム静止していたら撮影可とするか */
  requiredFrames: number;
  maxDiff: number;
  minSharpness: number;
}

export const DEFAULT_STABILITY: StabilityOptions = { requiredFrames: 3, maxDiff: 3, minSharpness: 40 };

/** ブレなし・静止を満たすフレームが連続したら true を返す */
export class StabilityTracker {
  private prev: Gray | null = null;
  private streak = 0;

  constructor(private readonly opts: StabilityOptions = DEFAULT_STABILITY) {}

  push(frame: Gray, screenDetected: boolean): boolean {
    const still = this.prev !== null && frameDiff(this.prev, frame) <= this.opts.maxDiff;
    const sharp = sharpness(frame) >= this.opts.minSharpness;
    this.prev = frame;
    this.streak = screenDetected && still && sharp ? this.streak + 1 : 0;
    return this.streak >= this.opts.requiredFrames;
  }

  reset() {
    this.prev = null;
    this.streak = 0;
  }
}

/** 同じ値が連続 N フレーム読めたら確定する */
export class ConsensusVoter<T> {
  private last: string | null = null;
  private count = 0;
  private lastValue: T | null = null;

  constructor(
    private readonly required = 2,
    private readonly keyOf: (v: T) => string = (v) => JSON.stringify(v),
  ) {}

  push(value: T): T | null {
    const key = this.keyOf(value);
    this.count = key === this.last ? this.count + 1 : 1;
    this.last = key;
    this.lastValue = value;
    return this.count >= this.required ? this.lastValue : null;
  }

  reset() {
    this.last = null;
    this.count = 0;
    this.lastValue = null;
  }
}
