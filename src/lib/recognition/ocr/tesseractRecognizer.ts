import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { rawFromTokens } from "../fromTokens";
import { rawFromRegions } from "../fromRegions";
import type { Recognizer, RecognizeInput } from "../recognizer";
import type { OcrToken } from "../tokens";
import { maskVariant, VARIANTS, type Variant } from "./preprocess";

const WORK_WIDTH = 1600;
const TITLE_WIDTH = 1400;
const SCORE_WIDTH = 600;
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

type Worker = import("tesseract.js").Worker;

/**
 * 複数の前処理を順に OCR し、得たトークンを累積して解く。
 * EX まで検算で裏付けられた時点で打ち切る（速さ優先）。最後まで裏付けられなければ候補付きで返す。
 */
export class TesseractRecognizer implements Recognizer {
  private worker: Promise<Worker> | null = null;

  constructor(private readonly getMaster: () => readonly SongMasterEntry[]) {}

  /** 起動直後に呼んでおくと、初回の読み取りが速くなる */
  warmUp(): Promise<unknown> {
    return this.ensureWorker();
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

    await worker.setParameters({ ...base, tessedit_char_whitelist: "0123456789+" });
    const scoreReadings: string[][] = [];
    for (const v of SCORE_VARIANTS) {
      const tokens = await this.readVariant(worker, toImageData(regions.score, SCORE_WIDTH), v);
      scoreReadings.push(tokens.map((t) => t.text));
    }
    await worker.setParameters({ ...base, tessedit_char_whitelist: "" });
    return rawFromRegions(titleTokens, scoreReadings, this.getMaster());
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
