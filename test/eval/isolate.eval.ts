import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { digitRuns, scoreCandidates } from "@/lib/recognition/paddle/parse";
import { isolateDigitRow } from "@/lib/recognition/ocr/isolate";
import { maskVariant } from "@/lib/recognition/ocr/preprocess";
import { createNodeEngine } from "./paddleNode";

const truth: Record<string, string> = {
  "20261126060215": "1779", "20261126060242": "3695", "20261126060255": "3695", "20261126060306": "3953", "20261126060316": "3953",
  "20261126061944": "3307", "20261126061917": "3437", "20261126062237": "4164",
};
it("isolate", async () => {
  const engine = await createNodeEngine("small");
  const tiles: Buffer[] = [];
  const tally = { plain: 0, isolated: 0, plainExact: 0, isolatedExact: 0 };
  for (const [id, ex] of Object.entries(truth)) {
    const src = readFileSync(`internal/captures/${id}_score.jpg`);
    const { data, info } = await sharp(src).resize({ width: 700 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const plain = maskVariant(new Uint8ClampedArray(data), "cyanFill");
    const iso = isolateDigitRow(plain, info.width, info.height);
    const toPng = (px: Uint8ClampedArray) => sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    const pPlain = await toPng(plain);
    const pIso = await toPng(iso);
    tiles.push(pPlain, pIso);
    const read = async (png: Buffer) => {
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      return { text: lines.map((l) => l.text + "(" + Math.round(l.confidence) + ")").join(" | "), runs: digitRuns(lines.map((l) => l.text)) };
    };
    const a = await read(pPlain);
    const b = await read(pIso);
    const hit = (r: { runs: string[] }) => r.runs.flatMap(scoreCandidates).includes(ex);
    const exact = (r: { runs: string[] }) => r.runs.includes(ex);
    if (hit(a)) tally.plain++;
    if (hit(b)) tally.isolated++;
    if (exact(a)) tally.plainExact++;
    if (exact(b)) tally.isolatedExact++;
    console.log(id, ex, "| plain:", a.text, "| isolated:", b.text);
  }
  console.log("候補に含む:", JSON.stringify(tally));
  const W = 700, H = 300;
  const comp = await sharp({ create: { width: W * 2, height: H * 8, channels: 3, background: "#888" } }).composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize({ width: W, height: H, fit: "contain", background: "#888" }).png().toBuffer(), left: (i % 2) * W, top: Math.floor(i / 2) * H })))).png().toFile("C:/Users/admin/AppData/Local/Temp/claude/449273ca3477c26c/b04660e9-33df-4fce-aa55-4e190b75502a/scratchpad/isolate.png");
  void comp;
  await engine.destroy();
}, 600000);
