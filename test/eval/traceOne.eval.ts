import { readFileSync } from "node:fs";
import { it } from "vitest";
import { PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import type { OcrTrace } from "@/lib/recognition/recognizer";
import type { SongMasterEntry } from "@/lib/songs/types";
import { installCanvasPolyfill, loadBitmap } from "./canvasPolyfill";
import { createNodeEngine } from "./paddleNode";

/** 1 枚の読みの記録を表示する: IDS=20261126113732 pnpm eval traceOne */
it("trace one", async () => {
  installCanvasPolyfill();
  const master: SongMasterEntry[] = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const engine = await createNodeEngine("small");
  for (const id of (process.env.IDS ?? "").split(",")) {
    const regions = { score: await loadBitmap(`internal/captures/${id}_score.jpg`), title: await loadBitmap(`internal/captures/${id}_title.jpg`), judge: await loadBitmap(`internal/captures/${id}_judge.jpg`) };
    let trace: OcrTrace | undefined;
    const raw = await new PaddleRecognizer(engine, () => master).recognize({ full: regions.score as never, regions: regions as never, onTrace: (t) => (trace = t) });
    console.log(`== ${id} ex=${raw?.exScore.value}`);
    console.log("steps", trace?.steps.map((s) => `${s.step}:${s.ex ?? "-"}`).join(" "));
    trace?.score.forEach((s, i) => console.log(`score[${i}]`, s.join(" | ")));
    console.log("judge", trace?.judge.join(" | "));
  }
  await engine.destroy();
}, 600000);
