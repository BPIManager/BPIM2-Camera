import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { DEFAULT_PLAN, PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import type { SongMasterEntry } from "@/lib/songs/types";
import { installCanvasPolyfill, loadBitmap } from "./canvasPolyfill";
import { createNodeEngine } from "./paddleNode";

/**
 * 全サンプルを読んで、曲・EX を internal/ex-<LABEL>.json に保存する（変更の前後を比べる用）: LABEL=x pnpm eval exAll
 * R2 の学習サンプル（確定したラベル。internal/r2samples-overrides.json で直したもの）は正解と比べる。captures は正解なし
 * PLAN で読む段階を変えられる（カンマ区切り）
 */
it("ex all", async () => {
  installCanvasPolyfill();
  const master: SongMasterEntry[] = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const overrides: Record<string, { ex?: number; exclude?: boolean }> = JSON.parse(readFileSync("internal/r2samples-overrides.json", "utf8"));
  type Sample = { id: string; files: Record<"score" | "title" | "judge", string>; truth: number | null };
  const samples: Sample[] = [];
  for (const u of readdirSync("internal/r2samples"))
    for (const id of readdirSync(path.join("internal/r2samples", u))) {
      const dir = path.join("internal/r2samples", u, id);
      if (!existsSync(path.join(dir, "score.jpg"))) continue;
      const o = Object.entries(overrides).find(([k]) => id.startsWith(k))?.[1];
      if (o?.exclude) continue;
      const j = JSON.parse(readFileSync(path.join(dir, "labels.json"), "utf8"));
      samples.push({ id: `r2/${id.slice(0, 8)}`, files: { score: path.join(dir, "score.jpg"), title: path.join(dir, "title.jpg"), judge: path.join(dir, "judge.jpg") }, truth: o?.ex ?? (j.confirmed === false ? null : (j.exScore ?? null)) });
    }
  for (const f of readdirSync("internal/captures").filter((f) => f.endsWith("_score.jpg"))) {
    const id = f.slice(0, -10);
    samples.push({ id: `cap/${id}`, files: { score: `internal/captures/${id}_score.jpg`, title: `internal/captures/${id}_title.jpg`, judge: `internal/captures/${id}_judge.jpg` }, truth: null });
  }
  const engine = await createNodeEngine("small");
  const plan = process.env.PLAN ? process.env.PLAN.split(",") : [...DEFAULT_PLAN];
  const rows: { id: string; ex: number | null; truth: number | null }[] = [];
  for (const s of samples) {
    const regions = { score: await loadBitmap(s.files.score), title: await loadBitmap(s.files.title), judge: await loadBitmap(s.files.judge) };
    const raw = await new PaddleRecognizer(engine, () => master, { plan }).recognize({ full: regions.score as never, regions: regions as never });
    rows.push({ id: s.id, ex: raw?.exScore.value ?? null, truth: s.truth });
  }
  await engine.destroy();
  writeFileSync(`internal/ex-${process.env.LABEL ?? "now"}.json`, JSON.stringify(rows, null, 1));
  const withTruth = rows.filter((r) => r.truth !== null);
  console.log(`[exAll ${process.env.LABEL ?? "now"}] n=${rows.length} EX 確定 ${rows.filter((r) => r.ex !== null).length} / 正解つき ${withTruth.length}: 正 ${withTruth.filter((r) => r.ex === r.truth).length} 誤 ${withTruth.filter((r) => r.ex !== null && r.ex !== r.truth).length}`);
}, 3_600_000);
