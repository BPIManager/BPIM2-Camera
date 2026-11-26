# BPIM2-Camera

beatmania IIDX のリザルト画面を撮影/取り込みして OCR し、BPI を算出する PWA。要件は [docs/requirements.md](docs/requirements.md)。

## 構成

- Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui（デザインは Hallmark 準拠で、AI 臭い装飾を避ける）
- 推論は端末内（Worker + OffscreenCanvas）。通信は BPI 計算 API と曲マスタ更新のみ
- パスエイリアス: `@/` → `src/`
- 曲マスタは BPIM2 の `allSongs` 相当（☆1〜12 全難易度）。BPI は ☆11/12 のみ算出し、それ以外は「BPI算出対象外」としつつ読み取り・X シェアは行える

## ルール（`.claude/rules/`）

bpim2 から継承。`git-workflow.md` のみ本リポジトリ向けに master 運用へ調整済み。
