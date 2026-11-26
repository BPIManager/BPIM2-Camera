// 本番の依存ライブラリのライセンス一覧を src/generated/licenses.json に書き出す（設定画面の表記用）。
// 依存を変えたら `pnpm licenses:gen` で作り直してコミットする
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const raw = JSON.parse(execSync("pnpm licenses list --prod --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const entries = [];
for (const [license, pkgs] of Object.entries(raw)) {
  for (const p of pkgs) {
    for (const version of p.versions) entries.push({ name: p.name, version, license, homepage: p.homepage ?? "" });
  }
}
// 同名・同版は 1 件にまとめる
const seen = new Set();
const unique = entries.filter((e) => !seen.has(`${e.name}@${e.version}`) && seen.add(`${e.name}@${e.version}`));
unique.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

mkdirSync("src/generated", { recursive: true });
writeFileSync("src/generated/licenses.json", `${JSON.stringify(unique, null, 1)}\n`);
console.log(`${unique.length} packages`);
