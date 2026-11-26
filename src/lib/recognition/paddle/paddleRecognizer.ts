import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { isolateDigitRow } from "../ocr/isolate";
import { maskVariant, type Variant } from "../ocr/preprocess";
import { logOcr } from "@/lib/debug/ocrLog";
import type { Recognizer, RecognizeInput } from "../recognizer";
import type { OcrEngine, OcrLine } from "./engine";
import { resolveResult } from "../resolve";
import { rawFromPaddle } from "./fromPaddle";

/**
 * スコア欄は、水色の数字だけを色で抜き出してから読む（左隣の前回スコアや背景を除くため）。
 * EX が確定しなければ、緩い条件・元の画像の順に読み直す（確定すれば省いて速くする）
 */
const SCORE_PASSES: readonly { width: number; mask: Variant | null; isolate?: boolean }[] = [
  { width: 700, mask: "cyanFill" },
  // 数字の列だけを残す（NEW RECORD のバッジなど、数字に接した水色の塊を除く）
  { width: 700, mask: "cyanFill", isolate: true },
  { width: 700, mask: "cyanFillLoose" },
  { width: 400, mask: null },
];
/**
 * 曲名の枠は、まずグレースケールで濃淡を伸ばして読む（色つきの文字や背景に強い）。
 * 難易度や曲名が取れなければ、元の画像でも読み直す
 */
const TITLE_PASSES: readonly { width: number; mask: Variant | null }[] = [
  { width: 1200, mask: "gray" },
  { width: 900, mask: null },
];
/** 判定表は小さい数字なので、確定しなければ拡大率を上げて読み直す */
const JUDGE_WIDTHS = [700, 1200, 1600] as const;

async function encode(bitmap: ImageBitmap, width: number, mask: Variant | null = null, isolate = false): Promise<ArrayBuffer> {
  const h = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
  const c = new OffscreenCanvas(width, h);
  const ctx = c.getContext("2d", { willReadFrequently: mask !== null })!;
  ctx.drawImage(bitmap, 0, 0, width, h);
  if (mask) {
    const src = ctx.getImageData(0, 0, width, h);
    const masked = maskVariant(src.data, mask);
    ctx.putImageData(new ImageData(isolate ? isolateDigitRow(masked, width, h) : masked, width, h), 0, 0);
  }
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
    if (!input.regions) {
      input.onStage?.("画像全体を読んでいます");
      return this.fallback ? this.fallback.recognize(input) : null;
    }
    const r = input.regions;
    // 段階が変わるたびに、中止されていないか確かめる（OCR の 1 回の途中では止められないので、その切れ目で止める）
    const stage = (label: string) => {
      input.signal?.throwIfAborted();
      input.onStage?.(label);
    };
    // 曲が確定したら、その時点で知らせる（同じ曲は 1 回だけ。あとから別の曲に変われば、また知らせる）
    let announced: string | null = null;
    const announceIfResolved = (candidate: RawResult | null): boolean => {
      const chart = candidate ? resolveResult(candidate, this.getMaster()).chart : null;
      if (!chart) return false;
      if (announced !== chart.title) {
        announced = chart.title;
        input.onSong?.({ kind: "resolved", title: chart.title });
      }
      return true;
    };
    stage("曲名と難易度を読んでいます");
    const t0 = performance.now();
    const title: OcrLine[] = await this.engine.readLines(await encode(r.title, TITLE_PASSES[0].width, TITLE_PASSES[0].mask));
    // 難易度も曲名も取れなければ、元の画像でも曲名の枠を読み直す
    const first = rawFromPaddle({ title, score: [], judge: [] }, this.getMaster());
    let resolved = announceIfResolved(first);
    if (!resolved && (!first || first.difficulty === null || first.titleText === null)) {
      stage("曲名をもう一度読んでいます");
      title.push(...(await this.engine.readLines(await encode(r.title, TITLE_PASSES[1].width, TITLE_PASSES[1].mask))));
      resolved = announceIfResolved(rawFromPaddle({ title, score: [], judge: [] }, this.getMaster()));
    }
    // 曲名の読み取りを尽くしても確定できない。ここで知らせる（判定やスコアの手がかりで、あとから確定することもある）
    if (!resolved) input.onSong?.({ kind: "unresolved" });
    stage("判定の内訳を読んでいます");
    const judge: OcrLine[][] = [await this.engine.readLines(await encode(r.judge, JUDGE_WIDTHS[0]))];
    const score: OcrLine[][] = [];
    const scoreGroups: ("color" | "raw")[] = [];
    let raw: RawResult | null = null;
    for (const [i, pass] of SCORE_PASSES.entries()) {
      stage(i === 0 ? "EXスコアを読んでいます" : `EXスコアを読み直しています（${i + 1}/${SCORE_PASSES.length}）`);
      score.push(await this.engine.readLines(await encode(r.score, pass.width, pass.mask, pass.isolate)));
      scoreGroups.push(pass.mask ? "color" : "raw");
      raw = rawFromPaddle({ title, score, scoreGroups, judge }, this.getMaster());
      announceIfResolved(raw);
      if (raw?.exScore.value != null) break;
    }
    for (const w of JUDGE_WIDTHS.slice(1)) {
      if (raw?.exScore.value != null) break;
      stage("判定の数字からスコアを確かめています");
      judge.push(await this.engine.readLines(await encode(r.judge, w)));
      raw = rawFromPaddle({ title, score, scoreGroups, judge }, this.getMaster());
      announceIfResolved(raw);
    }
    logOcr({
      title,
      score,
      judge: judge.flat(),
      result: raw && { title: raw.titleText, notes: raw.notes, difficulty: raw.difficulty, level: raw.level, ex: raw.exScore.value, judge: raw.judge },
      ms: performance.now() - t0,
    });
    return raw;
  }
}
