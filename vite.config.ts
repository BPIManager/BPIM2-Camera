import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
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
      workbox: { globPatterns: ["**/*.{js,css,html,png,json,wasm}"] },
    }),
  ],
  // tailscale serve 経由（*.ts.net）でスマホから開けるようにする
  server: { host: true, allowedHosts: [".ts.net"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
