import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { rawFromTokens } from "../fromTokens";
import { chartResolvedByHints, rawFromRegions } from "../fromRegions";
import { loadDigitModel } from "../glyphs/modelLoader";
import { modelCoverage, readScoreByGlyphs } from "../glyphs/readScore";
import type { Recognizer, RecognizeInput } from "../recognizer";
import type { OcrToken } from "../tokens";
import { maskVariant, VARIANTS, type Variant } from "./preprocess";

const WORK_WIDTH = 1600;
const TITLE_WIDTH = 1400;
const SCORE_WIDTH = 600;
/** 数字モデルの学習時と同じ高さに揃える */
const GLYPH_ROW_HEIGHT = 120;
const TITLE_VARIANTS: readonly Variant[] = ["white", "contrast", "bright"];
const SCORE_VARIANTS: readonly Variant[] = ["cyan", "white", "contrast", "bright"];

/** 切り出し画像を OCR 向けの大きさに拡大して画素を取り出す */
function toImageData(bitmap: ImageBitmap, width: number): ImageData {
  const h = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
  const c = new OffscreenCanvas(width, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, h);
  return ctx.getImageData(0, 0, width, h);
}

/** 高さを揃えて拡大・縮小する（数字の切り出しは高さ基準のため） */
function toImageDataByHeight(bitmap: ImageBitmap, height: number): ImageData {
  const w = Math.max(1, Math.round((bitmap.width * height) / bitmap.height));
  const c = new OffscreenCanvas(w, height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, height);
  return ctx.getImageData(0, 0, w, height);
}

type Worker = import("tesseract.js").Worker;

/**
 * 複数の前処理を順に OCR し、得たトークンを累積して解く。
 * EX まで検算で裏付けられた時点で打ち切る（速さ優先）。最後まで裏付けられなければ候補付きで返す。
 */
export class TesseractRecognizer implements Recognizer {
  private worker: Promise<Worker> | null = null;
  private jpWorker: Promise<Worker> | null = null;

  constructor(private readonly getMaster: () => readonly SongMasterEntry[]) {}

  /** 起動直後に呼んでおくと、初回の読み取りが速くなる */
  warmUp(): Promise<unknown> {
    return this.ensureWorker();
  }

  /** 日本語＋英語。曲名で必要になったときに初めて読み込む（データが大きいため） */
  private ensureJapaneseWorker(): Promise<Worker> {
    this.jpWorker ??= import("tesseract.js").then(async ({ createWorker, PSM }) => {
      const w = await createWorker(["jpn", "eng"]);
      await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return w;
    });
    return this.jpWorker;
  }

  private ensureWorker(): Promise<Worker> {
    this.worker ??= import("tesseract.js").then(async ({ createWorker, PSM }) => {
      const w = await createWorker("eng");
      await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return w;
    });
    return this.worker;
  }

  async recognize(input: RecognizeInput): Promise<RawResult | null> {
    return input.regions ? this.recognizeRegions(input.regions) : this.recognizeFull(input.full);
  }

  /** ガイド枠で切り出したスコア部と曲名帯をそれぞれ読む。スコアは数字だけを許可して複数の前処理で投票する */
  private async recognizeRegions(regions: { score: ImageBitmap; title: ImageBitmap }): Promise<RawResult | null> {
    const { PSM } = await import("tesseract.js");
    const worker = await this.ensureWorker();
    const base = { tessedit_pageseg_mode: PSM.SPARSE_TEXT };

    await worker.setParameters({ ...base, tessedit_char_whitelist: "" });
    const titleTokens: OcrToken[] = [];
    for (const v of TITLE_VARIANTS) titleTokens.push(...(await this.readVariant(worker, toImageData(regions.title, TITLE_WIDTH), v)));

    // 曲が譜面の条件だけで絞れなければ、日本語を含む曲名として読み直す
    let japaneseTitle: string | undefined;
    if (!chartResolvedByHints(titleTokens, this.getMaster())) {
      const jp = await this.ensureJapaneseWorker();
      const tokens: OcrToken[] = [];
      for (const v of TITLE_VARIANTS) tokens.push(...(await this.readVariant(jp, toImageData(regions.title, TITLE_WIDTH), v)));
      titleTokens.push(...tokens);
      japaneseTitle = tokens.map((t) => t.text).join("");
    }

    await worker.setParameters({ ...base, tessedit_char_whitelist: "0123456789+" });
    const scoreReadings: string[][] = [];
    // 1 桁ずつ切り出して分類する読み取り。見本が 10 桁そろっていないモデルは 1 票に抑える
    const model = await loadDigitModel();
    if (model) {
      const g = readScoreByGlyphs(toImageDataByHeight(regions.score, GLYPH_ROW_HEIGHT), model);
      if (g) {
        const votes = modelCoverage(model) === 10 && g.confidence >= 0.2 ? 2 : 1;
        for (let i = 0; i < votes; i++) scoreReadings.push([String(g.value)]);
      }
    }
    for (const v of SCORE_VARIANTS) {
      const tokens = await this.readVariant(worker, toImageData(regions.score, SCORE_WIDTH), v);
      scoreReadings.push(tokens.map((t) => t.text));
    }
    await worker.setParameters({ ...base, tessedit_char_whitelist: "" });
    return rawFromRegions(titleTokens, scoreReadings, this.getMaster(), japaneseTitle);
  }

  private async recognizeFull(frame: ImageBitmap): Promise<RawResult | null> {
    const scale = WORK_WIDTH / frame.width;
    const w = WORK_WIDTH;
    const h = Math.round(frame.height * scale);
    const base = new OffscreenCanvas(w, h);
    const ctx = base.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(frame, 0, 0, w, h);
    const source = ctx.getImageData(0, 0, w, h);

    const worker = await this.ensureWorker();
    const tokens: OcrToken[] = [];
    let best: RawResult | null = null;
    for (const variant of VARIANTS) {
      tokens.push(...(await this.readVariant(worker, source, variant)));
      best = rawFromTokens(tokens, this.getMaster());
      if (best && best.exScore.value !== null) break;
    }
    return best;
  }

  private async readVariant(worker: Worker, source: ImageData, variant: Variant): Promise<OcrToken[]> {
    const pixels = maskVariant(source.data, variant);
    const canvas = new OffscreenCanvas(source.width, source.height);
    canvas.getContext("2d")!.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const out: OcrToken[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const wd of l.words) if (wd.text.trim()) out.push({ text: wd.text.trim(), confidence: wd.confidence });
    return out;
  }
}
