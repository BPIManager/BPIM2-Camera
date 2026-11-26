import type { RawResult } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";
import { rawFromTokens } from "../fromTokens";
import type { Recognizer } from "../recognizer";
import type { OcrToken } from "../tokens";
import { maskVariant, VARIANTS, type Variant } from "./preprocess";

const WORK_WIDTH = 1600;

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

  async recognize(frame: ImageBitmap): Promise<RawResult | null> {
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
