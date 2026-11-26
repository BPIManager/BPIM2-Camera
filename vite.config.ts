import path from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const ISOLATION_HEADERS = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

/** 開発中だけ、ブラウザから送られた読み取りログをこのターミナルに表示する（スマホ実機のデバッグ用） */
function ocrDebugLog(): Plugin {
  return {
    name: "ocr-debug-log",
    apply: "serve",
    configureServer(server) {
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
  server: { host: true, allowedHosts: [".ts.net"], headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  // PaddleOCR は CPU（WASM）だけで動かす。WebGPU 版の WASM は 30MB と大きい
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "onnxruntime-web": "onnxruntime-web/wasm" } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
