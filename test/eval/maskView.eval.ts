import sharp, { type OverlayOptions } from "sharp";
import { it } from "vitest";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";

/** ミスカウントの切り出しに、水色の抜き出しをかけた結果を見る（internal/maskview.jpg） */
it("mask view", async () => {
  const ids = ["20261126101408", "20261126100638", "20261126065220", "20261126120208", "20261126063618"];
  const comps: OverlayOptions[] = [];
  let y = 0;
  for (const id of ids) {
    const file = `internal/miss-${id}.jpg`;
    const { data, info } = await sharp(file).resize({ width: 300 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const row = [Buffer.from(data), Buffer.from(maskVariant(new Uint8ClampedArray(data), "cyanFill")), Buffer.from(maskVariant(new Uint8ClampedArray(data), "cyanFillLoose"))];
    for (const [i, buf] of row.entries()) comps.push({ input: await sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(), top: y, left: i * 310 });
    y += info.height + 6;
  }
  await sharp({ create: { width: 930, height: y, channels: 3, background: "#444" } }).composite(comps).jpeg().toFile("internal/maskview.jpg");
});
