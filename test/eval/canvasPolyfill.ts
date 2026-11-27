import { createCanvas, ImageData as NapiImageData, loadImage, type Canvas, type Image } from "@napi-rs/canvas";

/**
 * 評価用: ブラウザの OffscreenCanvas・ImageBitmap を @napi-rs/canvas で代用し、認識器（PaddleRecognizer）を Node でそのまま動かす。
 * 認識器が使う範囲（drawImage・getImageData・putImageData・convertToBlob・createImageBitmap）だけを用意する。
 */
class NodeOffscreenCanvas {
  readonly canvas: Canvas;
  constructor(width: number, height: number) {
    this.canvas = createCanvas(width, height);
  }
  get width() {
    return this.canvas.width;
  }
  get height() {
    return this.canvas.height;
  }
  getContext(_type: "2d", _opts?: unknown) {
    const ctx = this.canvas.getContext("2d");
    const draw = ctx.drawImage.bind(ctx) as (...a: unknown[]) => void;
    // OffscreenCanvas を drawImage に渡されたときは、中の canvas を渡す
    (ctx as unknown as { drawImage: (...a: unknown[]) => void }).drawImage = (src: unknown, ...rest: unknown[]) =>
      draw(src instanceof NodeOffscreenCanvas ? src.canvas : src, ...rest);
    return ctx;
  }
  async convertToBlob(opts?: { type?: string }) {
    const buf = opts?.type === "image/jpeg" ? this.canvas.toBuffer("image/jpeg") : this.canvas.toBuffer("image/png");
    return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
  }
}

/** 画像（ImageBitmap の代わり）。close は何もしない */
export type NodeBitmap = (Image | Canvas) & { close(): void };

const withClose = <T extends object>(x: T): T & { close(): void } => Object.assign(x, { close: () => undefined });

export async function loadBitmap(file: string | Buffer): Promise<NodeBitmap> {
  return withClose(await loadImage(file));
}

export function installCanvasPolyfill() {
  const g = globalThis as Record<string, unknown>;
  g.OffscreenCanvas ??= NodeOffscreenCanvas;
  g.ImageData ??= NapiImageData;
  g.createImageBitmap ??= async (src: unknown) => {
    if (src instanceof NodeOffscreenCanvas) {
      const c = createCanvas(src.width, src.height);
      c.getContext("2d").drawImage(src.canvas, 0, 0);
      return withClose(c);
    }
    return withClose(src as object);
  };
}
