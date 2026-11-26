import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";

const file = process.argv[2];
const variants = {
  raw: (s) => s.greyscale().normalise(),
  inv: (s) => s.greyscale().normalise().negate(),
  thr: (s) => s.greyscale().normalise().threshold(170),
};
const worker = await createWorker("eng");
await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
for (const [name, fn] of Object.entries(variants)) {
  const img = sharp(file).resize({ width: 2000, withoutEnlargement: false });
  const buf = await fn(img).png().toBuffer();
  const { data } = await worker.recognize(buf);
  const words = data.text.split("\n").filter(Boolean).join(" | ");
  console.log(`--- ${name}\n${words}\n`);
}
await worker.terminate();
