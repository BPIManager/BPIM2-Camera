import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { logOcr } from "@/lib/debug/ocrLog";
import type { Recognizer, RecognizeInput } from "../recognizer";
import type { OcrEngine, OcrLine } from "./engine";
import { rawFromPaddle } from "./fromPaddle";

/** スコア欄は 1 回目で EX が確定しなければ、拡大率を変えてもう 1 回読む（確定すれば省いて速くする） */
const SCORE_WIDTHS = [400, 1100] as const;
const TITLE_WIDTH = 900;
const SMALL_WIDTH = 700;

async function encode(bitmap: ImageBitmap, width: number): Promise<ArrayBuffer> {
  const h = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
  const c = new OffscreenCanvas(width, h);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, width, h);
  return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
}

/** 枠で切り出した 3 か所を PaddleOCR で読み、合意エンジンで EX を決める。全体画像だけのとき（画像取り込み）は代替の認識器に任せる */
export class PaddleRecognizer implements Recognizer {
  constructor(
    private readonly engine: OcrEngine,
    private readonly getMaster: () => readonly SongMasterEntry[],
    private readonly fallback?: Recognizer,
  ) {}

  async recognize(input: RecognizeInput): Promise<RawResult | null> {
    if (!input.regions) return this.fallback ? this.fallback.recognize(input) : null;
    const r = input.regions;
    const t0 = performance.now();
    const title = await this.engine.readLines(await encode(r.title, TITLE_WIDTH));
    const judge = await this.engine.readLines(await encode(r.judge, SMALL_WIDTH));
    const score: OcrLine[][] = [];
    let raw: RawResult | null = null;
    for (const w of SCORE_WIDTHS) {
      score.push(await this.engine.readLines(await encode(r.score, w)));
      raw = rawFromPaddle({ title, score, judge }, this.getMaster());
      if (raw?.exScore.value != null) break;
    }
    logOcr({
      title,
      score,
      judge,
      result: raw && { title: raw.titleText, notes: raw.notes, difficulty: raw.difficulty, level: raw.level, ex: raw.exScore.value, judge: raw.judge },
      ms: performance.now() - t0,
    });
    return raw;
  }
}
