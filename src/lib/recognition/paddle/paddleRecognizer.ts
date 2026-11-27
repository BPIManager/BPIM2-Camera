import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { isolateDigitRow } from "../ocr/isolate";
import { maskVariant, type Variant } from "../ocr/preprocess";
import { logOcr, toTrace } from "@/lib/debug/ocrLog";
import type { OcrStep, OcrTrace, Recognizer, RecognizeInput } from "../recognizer";
import type { OcrEngine, OcrImage, OcrLine } from "./engine";
import { resolveResult } from "../resolve";
import { rawFromPaddle } from "./fromPaddle";
import { deskewBitmap, estimateBitmapTilt, rotateBitmap } from "./deskewBitmap";

/** スコア欄・判定表を読む 1 段階 */
type Pass = { kind: "score"; width: number; mask: Variant | null; isolate?: boolean; deskew?: boolean } | { kind: "judge"; width: number; deskew?: boolean };

/**
 * スコア欄・判定表を読む段階。EX が確定した時点で残りを省く。
 * - スコア欄は、水色の数字だけを色で抜き出してから読む（左隣の前回スコアや背景を除くため）。決まらなければ、緩い条件・元の画像で読み直す
 * - 判定表は小さい数字なので、決まらなければ拡大率を上げて読み直す
 */
export const PASSES: Record<string, Pass> = {
  judge700: { kind: "judge", width: 700 },
  cyan: { kind: "score", width: 700, mask: "cyanFill" },
  // 数字の列だけを残す（NEW RECORD のバッジなど、数字に接した水色の塊を除く）
  isolate: { kind: "score", width: 700, mask: "cyanFill", isolate: true },
  loose: { kind: "score", width: 700, mask: "cyanFillLoose" },
  raw400: { kind: "score", width: 400, mask: null },
  judge1200: { kind: "judge", width: 1200 },
  judge1600: { kind: "judge", width: 1600 },
  // 傾きを直して読み直す（斜めに撮った写真）。傾きが小さければ省く
  scoreDeskew: { kind: "score", width: 700, mask: "cyanFill", deskew: true },
  judgeDeskew: { kind: "judge", width: 1200, deskew: true },
};
export const DEFAULT_PLAN = ["judge700", "cyan", "isolate", "loose", "raw400", "judge1200", "judge1600"] as const;
const SCORE_PASS_COUNT = Object.values(PASSES).filter((p) => p.kind === "score" && !p.deskew).length;
/**
 * 曲名の枠は、まずグレースケールで濃淡を伸ばして読む（色つきの文字や背景に強い）。
 * 難易度や曲名が取れなければ、元の画像でも読み直す
 */
const TITLE_PASSES: readonly { width: number; mask: Variant | null }[] = [
  { width: 1200, mask: "gray" },
  { width: 900, mask: null },
];

export interface PaddleRecognizerOptions {
  /** スコア欄・判定表を読む順（PASSES の名前）。既定は DEFAULT_PLAN */
  plan?: readonly string[];
  /** false なら、画像を PNG に符号化して渡す（既定は画素のまま渡し、符号化・復号を省く） */
  pixels?: boolean;
  /**
   * スコア欄・判定表を読むエンジン（曲名とは別の Worker）。あれば、曲名を読んでいる間に、こちらでスコア欄・判定表を読み進める。
   * 実機（Android 6 コア）では、2 つの Worker に同じ種類の読みを振り分けるより、曲名と、スコア欄・判定表で分けるほうが速い
   * （同時に読むと 1 回ずつが遅くなり、待っている読みが遅れるため）
   */
  passEngine?: OcrEngine;
  /**
   * スコア欄・判定表の読みを、いくつ先まで頼んでおくか。先読みした読みは plan の順に使い、EX が確定した時点で残りは捨てるので、
   * 結果は先読みしないときと同じになる。既定は 0（先読みしない）
   */
  ahead?: number;
  /**
   * スコア欄・判定表を傾き補正するときの、傾きの求め方。title は曲名の枠から求めた傾きを使う（3 か所は同じ写真なので、傾きは共通。
   * 曲名の枠は文字の行が多く、数字 1 行のスコア欄より傾きを推定しやすい）。self は、それぞれの枠から求める。既定は title
   */
  tiltSource?: "title" | "self";
}

/** 先読みの取り消しに対応したエンジン（EnginePool） */
const canCancel = (e: OcrEngine): e is OcrEngine & { cancelPending(): void } => typeof (e as { cancelPending?: unknown }).cancelPending === "function";

/** 画像を縮小・前処理する */
function prepare(bitmap: ImageBitmap, width: number, mask: Variant | null = null, isolate = false): OffscreenCanvas {
  const h = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
  const c = new OffscreenCanvas(width, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, h);
  if (mask) {
    const src = ctx.getImageData(0, 0, width, h);
    const masked = maskVariant(src.data, mask);
    ctx.putImageData(new ImageData(isolate ? isolateDigitRow(masked, width, h) : masked, width, h), 0, 0);
  }
  return c;
}

async function encode(c: OffscreenCanvas, pixels: boolean): Promise<OcrImage> {
  if (pixels) return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
  return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
}

/** 枠で切り出した 3 か所を PaddleOCR で読み、合意エンジンで EX を決める（撮影も取り込みも同じ） */
export class PaddleRecognizer implements Recognizer {
  constructor(
    private readonly engine: OcrEngine,
    private readonly getMaster: () => readonly SongMasterEntry[],
    private readonly options: PaddleRecognizerOptions = {},
  ) {}

  /** 画像を符号化して読む。読んだ画像の大きさを行に付ける（記録で位置を割合にするため） */
  private async read(bitmap: ImageBitmap, width: number, mask: Variant | null = null, isolate = false, engine: OcrEngine = this.engine): Promise<OcrLine[]> {
    const c = prepare(bitmap, width, mask, isolate);
    const size = { width: c.width, height: c.height };
    const lines = await engine.readLines(await encode(c, this.options.pixels ?? true));
    return lines.map((l) => ({ ...l, size }));
  }

  async recognize(input: RecognizeInput): Promise<RawResult | null> {
    // 枠で切り出した画像がなければ読めない（撮影も取り込みも、枠で切り出してから読む）
    if (!input.regions) return null;
    try {
      return await this.recognizeRegions(input, input.regions);
    } finally {
      // 要らなくなった先読み（まだ始まっていないもの）を取り消す。次の読み取りを待たせない
      for (const e of [this.engine, this.options.passEngine]) if (e && canCancel(e)) e.cancelPending();
    }
  }

  private async recognizeRegions(input: RecognizeInput, r: NonNullable<RecognizeInput["regions"]>): Promise<RawResult | null> {
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
    const t0 = performance.now();
    const steps: OcrStep[] = [];
    const resolvedAt: OcrTrace["resolvedAt"] = { song: null, ex: null };
    // 1 段階が終わるたびに、その時点で曲・EX が確定しているかを記録する（最初に確定した段階が resolvedAt）
    const mark = (step: string, lines: number, candidate: RawResult | null) => {
      const song = candidate ? resolveResult(candidate, this.getMaster()).chart?.title ?? null : null;
      const ex = candidate?.exScore.value ?? null;
      steps.push({ step, lines, ms: Math.round(performance.now() - t0), song, ex });
      resolvedAt.song ??= song ? step : null;
      resolvedAt.ex ??= ex !== null ? step : null;
    };
    // スコア欄・判定表の読み（plan の順）。頼んだ読みは覚えておき、先読みした分はそれを使う
    const plan = (this.options.plan ?? DEFAULT_PLAN).filter((n) => PASSES[n]);
    const ahead = this.options.ahead ?? 0;
    const passEngine = this.options.passEngine ?? this.engine;
    // 傾きを直したスコア欄・判定表（要るときに 1 回だけ作る）。傾きが小さければ null
    let titleTilt: number | null = null;
    const tiltOf = (bitmap: ImageBitmap) => (this.options.tiltSource === "self" ? estimateBitmapTilt(bitmap) : (titleTilt ??= estimateBitmapTilt(r.title)));
    const rotated = new Map<ImageBitmap, Promise<ImageBitmap | null>>();
    const leveled = (bitmap: ImageBitmap) => {
      if (!rotated.has(bitmap)) rotated.set(bitmap, rotateBitmap(bitmap, tiltOf(bitmap)).then((x) => x?.bitmap ?? null));
      return rotated.get(bitmap)!;
    };
    /** 1 段階を読む。傾き補正の段階で、傾きが小さければ null（読まない） */
    const readOne = async (pass: Pass): Promise<OcrLine[] | null> => {
      const source = pass.kind === "judge" ? r.judge : r.score;
      const bitmap = pass.deskew ? await leveled(source) : source;
      if (!bitmap) return null;
      return pass.kind === "judge" ? this.read(bitmap, pass.width, null, false, passEngine) : this.read(bitmap, pass.width, pass.mask, pass.isolate, passEngine);
    };
    const reads: Promise<OcrLine[] | null>[] = [];
    const readPass = (i: number): Promise<OcrLine[] | null> => {
      if (!reads[i]) {
        reads[i] = readOne(PASSES[plan[i]!]!);
        // 使わずに取り消した先読みの失敗は、捨てる
        reads[i].catch(() => undefined);
      }
      return reads[i];
    };
    /** plan の先頭から n 段階を、まだ頼んでいなければ頼んでおく */
    const prefetch = (n: number) => {
      for (let i = 0; i < Math.min(n, plan.length); i++) void readPass(i);
    };
    stage("曲名と難易度を読んでいます");
    // 曲名を先に頼み、そのあとに先読みを頼む
    const firstTitle = this.read(r.title, TITLE_PASSES[0].width, TITLE_PASSES[0].mask);
    prefetch(ahead);
    const title: OcrLine[] = await firstTitle;
    // 難易度も曲名も取れなければ、元の画像でも曲名の枠を読み直す
    const first = rawFromPaddle({ title, score: [], judge: [] }, this.getMaster());
    let resolved = announceIfResolved(first);
    mark("title:gray1200", title.length, first);
    if (!resolved && (!first || first.difficulty === null || first.titleText === null)) {
      stage("曲名をもう一度読んでいます");
      const n = title.length;
      title.push(...(await this.read(r.title, TITLE_PASSES[1].width, TITLE_PASSES[1].mask)));
      const cand = rawFromPaddle({ title, score: [], judge: [] }, this.getMaster());
      resolved = announceIfResolved(cand);
      mark("title:raw900", title.length - n, cand);
    }
    // それでも決まらなければ、写真が斜めかもしれない。文字の行の傾きを推定して水平に直し、もう一度読む
    // （斜めの文字は検出されにくい。決まらなかったときだけなので、ふだんは遅くならず、読めていたものを悪化させない）
    if (!resolved) {
      const level = await deskewBitmap(r.title);
      if (level) {
        stage("傾きを直して曲名を読んでいます");
        let n = title.length;
        title.push(...(await this.read(level.bitmap, TITLE_PASSES[0].width, TITLE_PASSES[0].mask)));
        let cand = rawFromPaddle({ title, score: [], judge: [] }, this.getMaster());
        resolved = announceIfResolved(cand);
        mark("title:deskew:gray1200", title.length - n, cand);
        if (!resolved) {
          n = title.length;
          title.push(...(await this.read(level.bitmap, TITLE_PASSES[1].width, TITLE_PASSES[1].mask)));
          cand = rawFromPaddle({ title, score: [], judge: [] }, this.getMaster());
          resolved = announceIfResolved(cand);
          mark("title:deskew:raw900", title.length - n, cand);
        }
        level.bitmap.close();
      }
    }
    // 曲名の読み取りを尽くしても確定できない。ここで知らせる（判定やスコアの手がかりで、あとから確定することもある）
    if (!resolved) input.onSong?.({ kind: "unresolved" });
    const judge: OcrLine[][] = [];
    const score: OcrLine[][] = [];
    const scoreGroups: ("color" | "raw")[] = [];
    let raw: RawResult | null = null;
    for (const [i, name] of plan.entries()) {
      if (raw?.exScore.value != null) break;
      const pass = PASSES[name]!;
      prefetch(i + 1 + ahead);
      if (pass.kind === "judge") stage(pass.deskew ? "傾きを直して判定を読んでいます" : judge.length === 0 ? "判定の内訳を読んでいます" : "判定の数字からスコアを確かめています");
      else stage(pass.deskew ? "傾きを直してEXスコアを読んでいます" : score.length === 0 ? "EXスコアを読んでいます" : `EXスコアを読み直しています（${score.length + 1}/${SCORE_PASS_COUNT}）`);
      const lines = await readPass(i);
      // 傾きが小さく、読み直さなかった
      if (!lines) continue;
      if (pass.kind === "judge") judge.push(lines);
      else {
        score.push(lines);
        scoreGroups.push(pass.mask ? "color" : "raw");
      }
      raw = rawFromPaddle({ title, score, scoreGroups, judge }, this.getMaster());
      announceIfResolved(raw);
      const label = (pass.kind === "judge" ? `judge:${pass.width}` : `score:${pass.mask ?? "raw"}${pass.isolate ? "-isolate" : ""}${pass.width}`).replace(":", pass.deskew ? ":deskew:" : ":");
      mark(label, (pass.kind === "judge" ? judge : score).at(-1)!.length, raw);
    }
    // 傾きを直した画像は、もう使わない
    for (const b of rotated.values()) void b.then((x) => x?.close()).catch(() => undefined);
    const entry = {
      title,
      score,
      judge: judge.flat(),
      result: raw && { title: raw.titleText, notes: raw.notes, difficulty: raw.difficulty, level: raw.level, ex: raw.exScore.value, judge: raw.judge },
      ms: performance.now() - t0,
      steps,
      resolvedAt,
    };
    logOcr(entry);
    input.onTrace?.(toTrace(entry));
    return raw;
  }
}
