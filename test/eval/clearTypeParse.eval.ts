import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { parseClearType } from "@/lib/recognition/clearType";

/** clearTypeRead の結果（internal/clearType-read.json）を parseClearType にかけて集計する: pnpm eval clearTypeParse */
it("clear type parse", () => {
  const rows: { id: string; lines: { text: string; x: number; w: number }[] | null }[] = JSON.parse(readFileSync("internal/clearType-read.json", "utf8"));
  const out: string[] = [];
  const tally = { n: rows.length, outside: 0, both: 0, currentOnly: 0, bestOnly: 0, none: 0 };
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.lines) {
      tally.outside++;
      continue;
    }
    const p = parseClearType(r.lines.map((l) => ({ text: l.text, box: { x: l.x, y: 0, width: l.w, height: 0 } })), 700);
    if (p.best && p.current) tally.both++;
    else if (p.current) tally.currentOnly++;
    else if (p.best) tally.bestOnly++;
    else tally.none++;
    counts[p.current ?? "(読めず)"] = (counts[p.current ?? "(読めず)"] ?? 0) + 1;
    out.push(`${r.id} best=${p.best} current=${p.current}  [${r.lines.map((l) => `${l.text}@${l.x}`).join(" | ")}]`);
  }
  writeFileSync("internal/clearType-parse.txt", `${out.join("\n")}\n\n${JSON.stringify(tally)}\n${JSON.stringify(counts)}\n`);
});
