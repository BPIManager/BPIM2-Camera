# BPIM2 Camera

IIDX のリザルト画面を撮影（または画像取り込み）して、曲・EX スコアを読み取り BPI を表示する PWA。要件は [docs/requirements.md](docs/requirements.md)。

## コマンド

- `pnpm dev` 開発サーバー / `pnpm build` ビルド / `pnpm test` テスト / `pnpm typecheck` 型チェック
- `node scripts/make-icons.mjs` PWA アイコンの再生成

## スマホ実機で確認する（Tailscale）

カメラは HTTPS が必須なので `tailscale serve` で HTTPS 化する。443 が別アプリで使用中の場合は 8443 を使う。

```
pnpm dev
tailscale serve --bg --https=8443 5183
# → https://<端末名>.<tailnet>.ts.net:8443 をスマホ（同じ tailnet）で開く
tailscale serve --https=8443 off   # 公開を止める
```

## BPI の扱い

BPI は ☆11・☆12 のみ算出する。☆10 以下も読み取り・履歴・X シェアは行い、BPI は「BPI算出対象外」と表示する。

## 読み取りの流れ

カメラ撮影は、白枠（スコア・曲名帯の 2 枠。設定で位置を調整可）の中だけを切り出して読む。

1. スコア: 水色の数字を色で抽出し、桁ごとに切り出して最近傍法で分類（学習済み `public/models/digits.json`）。tesseract.js（数字のみ許可）の読み取りも併用し、複数回の一致で確定
2. 曲名帯: tesseract.js で難易度・レベル・ノーツ数を読み、曲マスタを絞る。絞れなければ日本語モデルで曲名を読み直し（必要なときだけ読み込む）、編集距離で照合
3. 確定できれば確認なしで結果を表示。曲が絞れなければ候補、EX が未確定なら候補チップ、それでも駄目なときだけ手入力

## 学習データ

統計データの送信に同意していると、確認済みの結果（正解ラベル）と切り出した画像（スコア部・曲名帯のみ）を端末に貯める。設定の「書き出す」で zip（labels.json と画像）にできる。

- `pnpm train:digits`: `training/manifest.json` の正解ラベル付きサンプル（`SAMPLE_DIR`、既定 `D:/camera-example`）から数字モデルを作り直す
- `pnpm eval`: 実画像サンプルでの読み取り評価

## 現状

- 曲マスタは BPIM2 の `GET /api/v2/songs/master`（BPIM2 PR #699）。デプロイ前や失敗時は同梱シード
- 数字モデルは見本 12 個（数字 1・3・4・5・6・7・9）だけ。0・2・8 の見本がないため、モデルの読み取りは 1 票扱い。実写真での自動確定率は未計測
- 統計データの R2 送信は署名付き URL 発行 Worker が未実装（端末内の蓄積と書き出しは可能）

## ライセンス

[AGPL-3.0](LICENSE)
