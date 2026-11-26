import path from "node:path";
import { defineConfig } from "vitest/config";

/** 実画像サンプルでの読み取り評価（通常の `pnpm test` には含めない）: pnpm eval */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node", include: ["test/eval/**/*.eval.ts"] },
});
