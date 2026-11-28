// BPIM2 の、楽曲×難易度ごとの最も高いレーダー項目（topElements.json）を、src/generated/radar-top.json に書き出す（分析タブ用）。
// BPIM2 のリポジトリが隣にある前提（BPIM2_DIR で変えられる）: pnpm radar:gen
// いずれは BPIM2 の楽曲マスター API（/api/v2/songs/master）に含めてもらい、この同梱をやめる
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.env.BPIM2_DIR ?? path.resolve(import.meta.dirname, "../../bpim2");
const src = path.join(dir, "src/constants/iidx/radars/topElements.json");
const entries = JSON.parse(readFileSync(src, "utf8"));
const out = {};
for (const e of entries) out[`${e.title}___${e.difficulty}`] = e.top;
writeFileSync(path.resolve(import.meta.dirname, "../src/generated/radar-top.json"), `${JSON.stringify(out, null, 0)}\n`);
console.log(`${Object.keys(out).length} 件を書き出しました`);
