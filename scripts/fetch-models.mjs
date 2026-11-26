// PaddleOCR（PP-OCRv6 small・日本語を含む多言語）のモデルを public/models/paddle に取得する。
// 配信元を自前にして、PWA でオフラインでも読めるようにする。git には入れない（約 31MB）。
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main";
const FILES = [
  ["detection/ort/PP-OCRv6_small_det.ort", "PP-OCRv6_small_det.ort"],
  ["recognition/ort/PP-OCRv6_small_rec.ort", "PP-OCRv6_small_rec.ort"],
  ["recognition/ppocrv6_dict.txt", "ppocrv6_dict.txt"],
];
const dir = path.resolve(import.meta.dirname, "../public/models/paddle");
mkdirSync(dir, { recursive: true });
for (const [remote, name] of FILES) {
  const dest = path.join(dir, name);
  if (existsSync(dest) && !process.argv.includes("--force")) {
    console.log(`skip ${name}`);
    continue;
  }
  const res = await fetch(`${BASE}/${remote}`);
  if (!res.ok) throw new Error(`${remote}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`ok   ${name}`);
}
