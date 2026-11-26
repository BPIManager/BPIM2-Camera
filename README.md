# BPIM2 Camera

IIDX のリザルト画面を撮影（または画像取り込み）して、曲・EX スコアを読み取り BPI を表示する PWA。要件は [docs/requirements.md](docs/requirements.md)。

## コマンド

- `pnpm dev` 開発サーバー / `pnpm build` ビルド / `pnpm test` テスト / `pnpm typecheck` 型チェック
- `node scripts/make-icons.mjs` PWA アイコンの再生成

## BPI の扱い

BPI は ☆11・☆12 のみ算出する。☆10 以下も読み取り・履歴・X シェアは行い、BPI は「BPI算出対象外」と表示する。

## 現状

- 数字読み取り器は未実装（`NullRecognizer`）。撮影・取り込み後は曲検索と EX 入力の手入力に回る
- 曲マスタは暫定シード（`public/data/songs-master.json`）。BPIM2 側に allSongs 配信エンドポイントが必要
- 統計データ送信（R2）は署名付き URL 発行 Worker が未実装

## ライセンス

[AGPL-3.0](LICENSE)
