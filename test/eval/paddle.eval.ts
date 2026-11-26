import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, it } from "vitest";
import { pickTitleLine } from "@/lib/recognition/paddle/fromPaddle";
import { digitRuns, parseJudgeLines, parseRankGap } from "@/lib/recognition/paddle/parse";
import { parseChartHints } from "@/lib/recognition/tokens";
import { matchChart } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";
import { createNodeEngine } from "./paddleNode";

const DIR = process.env.SAMPLE_DIR ?? "D:/camera-example";
const MODEL = (process.env.PADDLE_MODEL ?? "small") as "tiny" | "small" | "medium";
const MASTER_CACHE = "internal/master.local.json";

async function loadMaster(): Promise<SongMasterEntry[]> {
  if (!existsSync(MASTER_CACHE)) {
    const res = await fetch("https://bpi2.poyashi.me/api/v2/songs/master");
    writeFileSync(MASTER_CACHE, JSON.stringify((await res.json()).body));
  }
  return JSON.parse(readFileSync(MASTER_CACHE, "utf8")).songs;
}

describe("paddle (全体画像)", () => {
  it("画像全体を読み、スコア・曲名・判定・差分を確認する", async () => {
    const master = await loadMaster();
    const labels = JSON.parse(readFileSync("internal/labels.local.json", "utf8")) as Record<string, { digits?: string }>;
    const engine = await createNodeEngine(MODEL);
    const out: string[] = [];
    let scoreHit = 0, scoreTotal = 0, titleConfident = 0, n = 0;
    for (const f of readdirSync(DIR).filter((x) => /\.(jpe?g|png|webp)$/i.test(x))) {
      const png = await sharp(path.join(DIR, f)).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: false }).png().toBuffer();
      const lines = await engine.readLines(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
      const texts = lines.map((l) => l.text);
      const title = pickTitleLine(lines);
      const hints = parseChartHints(lines.flatMap((l) => l.text.split(/\s+/).map((text) => ({ text, confidence: l.confidence }))));
      const m = matchChart(master, { ...hints, titleText: title });
      const runs = new Set(digitRuns(texts));
      const want = labels[f]?.digits;
      let hit = "-";
      if (want) { scoreTotal++; if (runs.has(want)) { scoreHit++; hit = "○"; } else hit = "×"; }
      n++;
      if (m.confident) titleConfident++;
      out.push(`${f}\n  score ${want ?? "?"} ${hit}   judge=${JSON.stringify(parseJudgeLines(texts))} gap=${JSON.stringify(parseRankGap(texts) ?? null)}\n  title="${title}" → ${m.candidates[0]?.entry.title ?? "-"} (${m.candidates[0]?.entry.difficulty ?? ""}${m.candidates[0]?.entry.level ?? ""}) confident=${m.confident}\n  lines: ${texts.join(" | ")}`);
    }
    await engine.destroy();
    out.push(`\n[${MODEL}] スコアが行内にそのまま現れた ${scoreHit}/${scoreTotal}、曲を確信して特定 ${titleConfident}/${n}`);
    writeFileSync(`internal/paddle-report-${MODEL}.txt`, out.join("\n"));
    console.log(out.at(-1));
  }, 900000);
});
