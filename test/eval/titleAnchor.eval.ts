import { readFileSync } from "node:fs";
import { it } from "vitest";
import { matchChart } from "@/lib/songs/matcher";

/** 曲名の手がかりに選ばれる行を見る */
it("title anchor", () => {
  const MASTER = JSON.parse(readFileSync("internal/master.local.json", "utf8")).songs;
  const scan = JSON.parse(readFileSync("internal/fullscan-small-1280.json", "utf8"));
  const tally = new Map<string, number>();
  for (const [, v] of Object.entries<{ lines: { text: string; confidence: number }[] }>(scan)) {
    let best: { t: string; s: number; m: string } | null = null;
    for (const l of v.lines) {
      if (l.confidence < 50 || l.text.trim().length < 3) continue;
      const c = matchChart(MASTER, { playStyle: "SP", difficulty: null, level: null, notes: null, titleText: l.text.trim() }).candidates[0];
      if (c && c.score >= 0.8 && (!best || c.score > best.s)) best = { t: l.text, s: c.score, m: c.entry.title };
    }
    const k = best ? `${best.t} → ${best.m}` : "(none)";
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(n, k);
});
