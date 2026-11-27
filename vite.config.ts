import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
      server.middlewares.use("/__debug/ocr", (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          console.log(`\n[ocr ${new Date().toLocaleTimeString("ja-JP")}]\n${body}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
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
        // 大きいもの（OCR のモデル・WASM）は事前取得せず、初めて使ったときに保存する
        globPatterns: ["**/*.{js,css,html,png,json}"],
        // サインインページと Firebase の中継（/__/auth/handler など）はアプリ本体に置き換えず、そのまま取得する
        // （/__/ を除外しないと、プロバイダからの戻りの遷移に index.html が返り、サインインが完了しない）
        navigateFallbackDenylist: [/^\/signin\.html/, /^\/__\//],
        globIgnores: ["models/paddle/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/models/paddle/") || url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: { cacheName: "ocr-assets", expiration: { maxEntries: 8 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  // tailscale serve 経由（*.ts.net）でスマホから開けるようにする
  // 分離されたページ（cross-origin isolated）にすると、OCR の WASM がマルチスレッドで動き、約 3 倍速くなる
  server: { host: true, allowedHosts: [".ts.net"], proxy: PROXY },
  preview: { proxy: PROXY },
  build: { rollupOptions: { input: { main: path.resolve(import.meta.dirname, "index.html"), signin: path.resolve(import.meta.dirname, "signin.html") } } },
  // PaddleOCR は、WebGPU が使える端末では GPU、なければ CPU（WASM）で動かす。WebGPU も使える版は WASM が約 30MB（CPU だけの版は約 15MB）だが、
  // 実機で約 45% 速くなる（初回だけ取得してキャッシュする）
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "onnxruntime-web": "onnxruntime-web/webgpu" } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
