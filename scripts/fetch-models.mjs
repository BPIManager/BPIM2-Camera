// PaddleOCR（PP-OCRv6 small・日本語を含む多言語。と、自動撮影の下見に使う tiny）のモデルを public/models/paddle に取得する。
// 配信元を自前にして、PWA でオフラインでも読めるようにする。git には入れない（small 約 31MB・tiny 約 6MB）。
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main";
const FILES = [
  // 本読みは ONNX 形式（WebGPU でも読める。.ort は CPU 向けに最適化済みで、WebGPU では読めない）
  ["detection/PP-OCRv6_small_det.onnx", "PP-OCRv6_small_det.onnx"],
  ["recognition/PP-OCRv6_small_rec.onnx", "PP-OCRv6_small_rec.onnx"],
  ["recognition/ppocrv6_dict.txt", "ppocrv6_dict.txt"],
  ["detection/ort/PP-OCRv6_tiny_det.ort", "PP-OCRv6_tiny_det.ort"],
  ["recognition/ort/PP-OCRv6_tiny_rec.ort", "PP-OCRv6_tiny_rec.ort"],
  ["recognition/ppocrv6_tiny_dict.txt", "ppocrv6_tiny_dict.txt"],
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
