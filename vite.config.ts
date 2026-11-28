import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * ビルドした版の情報（設定画面の一番下に出す）。最後のコミットのハッシュと日時、コミットしていない変更があるか。
 * git が使えない環境でビルドするときは、CI の環境変数（GITHUB_SHA など）から取り、なければ unknown
 */
function appVersion(): { commit: string; date: string | null; dirty: boolean } {
  const git = (args: string) => execSync(`git ${args}`, { cwd: import.meta.dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    return { commit: git("rev-parse --short HEAD"), date: git("log -1 --format=%cI"), dirty: git("status --porcelain --untracked-files=no") !== "" };
  } catch {
    const sha = process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.WORKERS_CI_COMMIT_SHA;
    return { commit: sha ? sha.slice(0, 7) : "unknown", date: null, dirty: false };
  }
}

const ISOLATION_HEADERS = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

/**
 * 同一オリジンの中継。本番は nginx 等で同じ中継を置く（README 参照）
 * - /__/auth: サインインの authDomain をこのアプリのホストにするための Firebase への中継
 * - /bpim2-api: 認証つき BPIM2 API（CORS 非対応）をブラウザから呼ぶための中継
 */
const PROXY = {
  "/__/auth": { target: "https://bpimv2.firebaseapp.com", changeOrigin: true },
  "/bpim2-api": { target: "https://bpi2.poyashi.me", changeOrigin: true, xfwd: true, rewrite: (p: string) => p.replace(/^\/bpim2-api/, "") },
};

/**
 * 開発サーバーだけの中継。本番には置かない
 * - /beat-seeker-api: beat-seeker の外部連携 API。開発サーバーのオリジン（localhost・tailscale）は CORS の許可リストにないため。
 *   本番のビルドは、ブラウザから beat-seeker を直接呼ぶ（トークンを自分のサーバーに通さない。src/lib/beatSeeker/client.ts）
 */
const DEV_PROXY = {
  "/beat-seeker-api": { target: "https://beat-seeker.onrender.com", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/beat-seeker-api/, "") },
};

/** 開発・プレビューで隔離ヘッダーを付ける。サインイン用ページ（signin.html と、Firebase の中継 /__/auth/）は除く（Firebase のリダイレクトが阻まれるため） */
function isolation(): Plugin {
  // 戻り値を返さない（関数を返すと Vite が「後処理フック」として呼んでしまう）
  const add = (server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => unknown } }) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/signin.html") && !req.url?.startsWith("/__/auth/")) for (const [k, v] of Object.entries(ISOLATION_HEADERS)) res.setHeader(k, v);
      next();
    });
  };
  return { name: "isolation-headers", configureServer: add, configurePreviewServer: add };
}

/** 開発中だけ、ブラウザから送られた読み取りログをこのターミナルに表示する（スマホ実機のデバッグ用） */
function ocrDebugLog(): Plugin {
  return {
    name: "ocr-debug-log",
    apply: "serve",
    configureServer(server) {
      // 撮影した画像と切り出し画像を internal/captures に保存する（git 管理外）
      server.middlewares.use("/__debug/img", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
        if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.includes("..")) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const dir = path.resolve(import.meta.dirname, "internal/captures");
          mkdirSync(dir, { recursive: true });
          writeFileSync(path.join(dir, name), Buffer.concat(chunks));
          res.statusCode = 204;
          res.end();
        });
      });
      // 読み取りの記録と、原因を調べるための出来事（Worker・カメラ・エラーなど）。ターミナルに出し、internal/debug.log にも貯める
      const logFile = path.resolve(import.meta.dirname, "internal/debug.log");
      server.middlewares.use("/__debug/ocr", (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          const at = new Date().toLocaleTimeString("ja-JP");
          console.log(`\n[ocr ${at}]\n${body}\n`);
          mkdirSync(path.dirname(logFile), { recursive: true });
          appendFileSync(logFile, `--- ${new Date().toLocaleDateString("ja-JP")} ${at} (受信)\n${body}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

/**
 * onnxruntime-web の版を、Worker ごとに出し分ける。CPU の Worker（*.cpu.worker.ts）は CPU だけの版（WASM 約 15MB）、
 * それ以外は WebGPU も使える版（約 29MB）。CPU だけで読む端末が、使わない GPU 用のランタイムを取得しなくて済むように。
 * ランタイムの WASM の URL は virtual:ort-runtime-cpu / -gpu から読む（アプリが取得とキャッシュを管理する）。
 * 開発サーバーでは Worker のモジュールを共有するので、出し分けられない。どちらも WebGPU 版を使う
 */
function ortFlavor(mode: "serve" | "build", worker = false): Plugin {
  let flavor: "wasm" | "webgpu" = "webgpu";
  const RUNTIME = { wasm: "onnxruntime-web/ort-wasm-simd-threaded.wasm?url", webgpu: "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url" };
  return {
    name: "ort-flavor",
    enforce: "pre",
    options(o) {
      if (worker && mode === "build") flavor = JSON.stringify(o.input ?? "").includes(".cpu.worker") ? "wasm" : "webgpu";
    },
    resolveId(id, importer) {
      if (id === "onnxruntime-web") return this.resolve(`onnxruntime-web/${flavor}`, importer, { skipSelf: true });
      if (id === "virtual:ort-runtime-cpu" || id === "virtual:ort-runtime-gpu") return "\0" + id;
      return null;
    },
    load(id) {
      if (id === "\0virtual:ort-runtime-gpu") return `export { default } from ${JSON.stringify(RUNTIME.webgpu)};`;
      if (id === "\0virtual:ort-runtime-cpu") return `export { default } from ${JSON.stringify(mode === "serve" ? RUNTIME.webgpu : RUNTIME.wasm)};`;
      return null;
    },
  };
}

export default defineConfig(({ command }) => ({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    ortFlavor(command),
    isolation(),
    ocrDebugLog(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["data/songs-master.json"],
      manifest: {
        name: "BPIM2 Camera",
        short_name: "BPIM2 Camera",
        description: "IIDX のリザルトを撮って BPI を記録する",
        lang: "ja",
        display: "standalone",
        orientation: "any",
        background_color: "#14171c",
        theme_color: "#14171c",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,json}"],
        // サインインページと Firebase の中継（/__/auth/handler など）はアプリ本体に置き換えず、そのまま取得する
        // （/__/ を除外しないと、プロバイダからの戻りの遷移に index.html が返り、サインインが完了しない）
        navigateFallbackDenylist: [/^\/signin\.html/, /^\/__\//],
        // OCR のモデルとランタイム（WASM）は、アプリが自分で取得してキャッシュする（取得の進み具合の表示と、設定からの削除のため。src/lib/recognition/assets.ts）
        // digits.json は数字の学習（評価用）にだけ使う。アプリは読まない
        globIgnores: ["models/paddle/**", "models/digits.json", "bench/**"],
      },
    }),
  ],
  // tailscale serve 経由（*.ts.net）でスマホから開けるようにする
  // 分離されたページ（cross-origin isolated）にすると、OCR の WASM がマルチスレッドで動き、約 3 倍速くなる
  server: { host: true, allowedHosts: [".ts.net"], proxy: { ...PROXY, ...DEV_PROXY } },
  preview: { proxy: PROXY },
  build: { rollupOptions: { input: { main: path.resolve(import.meta.dirname, "index.html"), signin: path.resolve(import.meta.dirname, "signin.html") } } },
  // onnxruntime-web の版は ortFlavor で出し分ける
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  worker: { plugins: () => [ortFlavor(command, true)] },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
}));
