import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";
import { maskVariant, type Variant } from "@/lib/recognition/ocr/preprocess";

/**
 * 検出を飛ばして、数字のある範囲を認識モデルに直接渡すと読めるか（#18 ミスカウント）: PREFIX=miss2 pnpm eval recOnly
 * 小さく淡い 1〜2 桁の数字は、検出（文字の場所を探す段階）で落ちている。場所が分かっていれば読めるかを見る
 */
it("recognition only", async () => {
  const labels: Record<string, number | null> = JSON.parse(readFileSync("internal/miss-labels.json", "utf8"));
  const s = new PaddleOcrService({ model: V6_SMALL_MODEL, processing: { engine: "canvas-native" } });
  await s.initialize();
  const svc = s as unknown as {
    platform: { canvas: { prepareCanvas: (b: ArrayBuffer) => Promise<unknown> } };
    recognitor: { run: (canvas: unknown, boxes: unknown[], dict: unknown, strategy: string, options?: unknown) => Promise<{ text: string; confidence: number }[]> };
    options: { recognition: { charactersDictionary: unknown } };
  };
  const variants: { name: string; x0: number; y1: number; mask: Variant | null; h: number }[] = [
    { name: "右50%・上65%・元", x0: 0.5, y1: 0.65, mask: null, h: 96 },
    { name: "右50%・上65%・水色", x0: 0.5, y1: 0.65, mask: "cyanFill", h: 96 },
    { name: "右50%・上65%・グレー", x0: 0.5, y1: 0.65, mask: "gray", h: 96 },
    { name: "右45%・上75%・元", x0: 0.55, y1: 0.75, mask: null, h: 96 },
  ];
  for (const v of variants) {
    const t = { ok: 0, bad: 0, none: 0 };
    for (const [id, truth] of Object.entries(labels)) {
      if (truth === null) continue;
      const file = `internal/${process.env.PREFIX ?? "miss2"}-${id}.jpg`;
      const m = await sharp(file).metadata();
      const left = Math.round(m.width! * v.x0), height = Math.max(4, Math.round(m.height! * v.y1));
      let img = sharp(file).extract({ left, top: 0, width: m.width! - left, height }).resize({ height: v.h });
      let png: Buffer;
      if (!v.mask) png = await img.png().toBuffer();
      else {
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        png = await sharp(Buffer.from(maskVariant(new Uint8ClampedArray(data), v.mask)), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
      }
      const meta = await sharp(png).metadata();
      const canvas = await svc.platform.canvas.prepareCanvas(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      const res = await svc.recognitor.run(canvas, [{ x: 0, y: 0, width: meta.width!, height: meta.height! }], svc.options.recognition.charactersDictionary, "per-box", { minimumConfidence: 0 });
      const text = (res[0]?.text ?? "").replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
      const d = text.match(/[0-9]{1,3}/)?.[0];
      const value = d !== undefined ? Number(d) : null;
      t[value === null ? "none" : value === truth ? "ok" : "bad"]++;
    }
    console.log(`[recOnly] ${v.name}: 正 ${t.ok} / 誤 ${t.bad} / 読めず ${t.none}`);
  }
  await s.destroy();
}, 1_800_000);
