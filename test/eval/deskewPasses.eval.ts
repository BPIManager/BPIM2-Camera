import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { DEFAULT_PLAN, PaddleRecognizer } from "@/lib/recognition/paddle/paddleRecognizer";
import type { OcrTrace } from "@/lib/recognition/recognizer";
import type { SongMasterEntry } from "@/lib/songs/types";
import { installCanvasPolyfill, loadBitmap } from "./canvasPolyfill";
import { createNodeEngine } from "./paddleNode";

/**
 * スコア欄・判定表の傾き補正の読み直しを評価する: pnpm eval deskewPasses
 * 読み直しは、いまの段階をすべて終えても EX が決まらないときだけ行うので、結果が変わりうるのは、いま EX が決まらない画像だけ。
 * いまの読み方で全部を読み、決まらなかったものだけ、傾き補正つき（曲名の枠の傾きを使う / 各枠の傾きを使う）で読み直して比べる。
 * 正解: R2 の学習サンプル（確定したラベル。internal/r2samples-overrides.json で直したもの）。captures は正解がないので、目で確かめる
 */
it("deskew passes", async () => {
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
      samples.push({ id: `r2/${id.slice(0, 8)}`, files: { score: path.join(dir, "score.jpg"), title: path.join(dir, "title.jpg"), judge: path.join(dir, "judge.jpg") }, truth: o?.ex ?? (j.confirmed === false ? null : j.exScore ?? null) });
    }
  for (const f of readdirSync("internal/captures").filter((f) => f.endsWith("_score.jpg"))) {
    const id = f.slice(0, -10);
    samples.push({ id: `cap/${id}`, files: { score: `internal/captures/${id}_score.jpg`, title: `internal/captures/${id}_title.jpg`, judge: `internal/captures/${id}_judge.jpg` }, truth: null });
  }
  const engine = await createNodeEngine("small");
  const read = async (s: Sample, plan: readonly string[], tiltSource: "title" | "self") => {
    const regions = { score: await loadBitmap(s.files.score), title: await loadBitmap(s.files.title), judge: await loadBitmap(s.files.judge) };
    let trace: OcrTrace | undefined;
    const raw = await new PaddleRecognizer(engine, () => master, { plan, tiltSource }).recognize({ full: regions.score as never, regions: regions as never, onTrace: (t) => (trace = t) });
    return { ex: raw?.exScore.value ?? null, steps: trace?.steps.map((x) => x.step) ?? [], ms: trace?.ms ?? 0 };
  };
  const PLAN = [...DEFAULT_PLAN, "scoreDeskew", "judgeDeskew"];
  const tally = { n: samples.length, unresolved: 0, title: { gained: 0, ok: 0, bad: 0 }, self: { gained: 0, ok: 0, bad: 0 } };
  for (const s of samples) {
    const base = await read(s, DEFAULT_PLAN, "title");
    if (base.ex !== null) continue;
    tally.unresolved++;
    const line = [`${s.id} 正解=${s.truth ?? "?"}`];
    for (const src of ["title", "self"] as const) {
      const r = await read(s, PLAN, src);
      const deskewSteps = r.steps.filter((x) => x.includes("deskew") && !x.startsWith("title")).length;
      line.push(`${src}: ex=${r.ex ?? "-"}（傾き補正の読み ${deskewSteps} 回・${Math.round(r.ms)}ms）`);
      if (r.ex !== null) {
        tally[src].gained++;
        if (s.truth !== null) tally[src][r.ex === s.truth ? "ok" : "bad"]++;
      }
    }
    console.log("  " + line.join(" / "));
  }
  await engine.destroy();
  console.log(`[deskewPasses] n=${tally.n} いま EX が決まらない ${tally.unresolved} 件`);
  for (const src of ["title", "self"] as const) console.log(`  ${src === "title" ? "曲名の枠の傾き" : "各枠の傾き"}: 新たに決まった ${tally[src].gained} 件（正解あり: 正 ${tally[src].ok} / 誤 ${tally[src].bad}）`);
}, 3_600_000);
