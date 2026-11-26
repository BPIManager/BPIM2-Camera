# BPIM2 Camera

IIDX のリザルト画面を撮影（または画像取り込み）して、曲・EX スコアを読み取り BPI を表示する PWA。要件は [docs/requirements.md](docs/requirements.md)。

## コマンド

- `pnpm dev` 開発サーバー / `pnpm build` ビルド / `pnpm test` テスト / `pnpm typecheck` 型チェック
- `node scripts/make-icons.mjs` PWA アイコンの再生成

## BPI の扱い

BPI は ☆11・☆12 のみ算出する。☆10 以下も読み取り・履歴・X シェアは行い、BPI は「BPI算出対象外」と表示する。

## 読み取りの流れ

1. 画像を色抽出の複数バリエーションで OCR し、トークンを集める（tesseract.js）
2. 難易度・レベル・ノーツ数で曲マスタを絞り、判定の合計＝ノーツ数・EX＝PG×2+GR の検算で EX を解く
3. 確定できれば確認なしで結果を表示
4. 曲が絞り切れなければ上位 3 件、EX が裏付けられなければ候補チップ
5. それでも到達できないときだけ手入力

## 現状

- 曲マスタは BPIM2 の `GET /api/v2/songs/master`（BPIM2 PR #699）。デプロイ前や失敗時は同梱シード
- **実写真での自動確定は未達**。`pnpm eval` で `D:/camera-example` を読ませた結果、全画面 OCR では 7 枚中 0 枚が正しく確定した。画面の四隅検出と台形補正、位置固定の領域切り出し、数字分類器が次の課題
- 統計データ送信（R2）は署名付き URL 発行 Worker が未実装

## ライセンス

[AGPL-3.0](LICENSE)
