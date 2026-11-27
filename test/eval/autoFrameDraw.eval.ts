import { readFileSync } from "node:fs";
import sharp from "sharp";
import { it } from "vitest";
import { matchChart } from "@/lib/songs/matcher";
import { findAnchors, fitFrames, type CanonicalLayout, type ScanLine } from "@/lib/vision/autoFrame";
import { GUIDE_KEYS } from "@/lib/vision/guides";

/** 正解の枠（緑）・置いた枠（赤）・手がかり（黄）を描いて internal/draw-<id>.jpg に保存する: IDS=... pnpm eval autoFrameDraw */
const MASTER = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
/** 曲データの曲名との一致度（曲名の行を手がかりにするため） */
const titleScoreOf = (text: string) => matchChart(MASTER, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: text }).candidates[0]?.score ?? 0;

it("draw", async () => {
  const canon: CanonicalLayout = JSON.parse(readFileSync("internal/canon.json", "utf8"));
  const scan = JSON.parse(readFileSync("internal/fullscan-small-1280.json", "utf8"));
  const truth = new Map(readFileSync("internal/crop-locations.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((o) => [o.id, o]));
  for (const id of (process.env.IDS ?? "").split(",")) {
    const file = `internal/captures/${id}_full.jpg`;
    const m = await sharp(file).metadata();
    const W = m.width!, H = m.height!;
    const lines: ScanLine[] = scan[id].lines.map((l: { text: string; confidence: number; x: number; y: number; w: number; h: number }) => ({ text: l.text, confidence: l.confidence, box: { x: l.x * W, y: l.y * H, width: l.w * W, height: l.h * H } }));
    const anchors = findAnchors(lines, { width: W, height: H }, titleScoreOf);
    const fit = fitFrames(anchors, canon, { width: W, height: H }, 2);
    const rect = (r: { x: number; y: number; width: number; height: number }, c: string) => `<rect x="${r.x * W}" y="${r.y * H}" width="${r.width * W}" height="${r.height * H}" fill="none" stroke="${c}" stroke-width="4"/>`;
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${GUIDE_KEYS.map((k) => rect(truth.get(id)[k], "#0f0")).join("")}${fit ? GUIDE_KEYS.map((k) => rect(fit.layout[k], "#f00")).join("") : ""}${anchors.map((a) => `<circle cx="${a.x}" cy="${a.y}" r="7" fill="#ff0"/><text x="${a.x + 8}" y="${a.y}" fill="#ff0" font-size="22">${a.kind}</text>`).join("")}</svg>`;
    const drawn = await sharp(file).composite([{ input: Buffer.from(svg) }]).jpeg().toBuffer();
    await sharp(drawn).resize({ width: 720 }).jpeg().toFile(`internal/draw-${id}.jpg`);
    console.log(id, anchors.map((a) => a.kind).join(","), fit?.used);
  }
}, 60000);
