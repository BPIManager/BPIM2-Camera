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

## サインイン（Firebase）の設定

authDomain はアプリ自身のホストで、`/__/auth/*` を `bpimv2.firebaseapp.com` へ中継する。別ドメインのままだと、ブラウザの保存領域の分離でリダイレクトの結果を受け取れない。開発・プレビューは Vite のプロキシが中継する（Tailscale 経由もそのまま動く）。

使うドメイン（検証: `*.ts.net`、本番: アプリの URL）ごとに、次を設定する。

1. Firebase コンソール > Authentication > 設定 > 承認済みドメインに追加
2. 各プロバイダ側のリダイレクト（コールバック）URI に `https://<ドメイン>/__/auth/handler` を追加
   - Google: Google Cloud コンソール > 認証情報 > Firebase 用の OAuth クライアント > 承認済みのリダイレクト URI
   - X: 開発者ポータルの Callback URI
   - LINE: LINE Login チャネルの Callback URL
3. メールでのサインイン（Turnstile つき）。BPIM2 の確認メール API を使い、Turnstile は BPIM2 のサーバーが検証する
   - `VITE_TURNSTILE_SITE_KEY` に、BPIM2 の `NEXT_PUBLIC_TURNSTILE_SITE_KEY` と同じ値を設定する
   - Cloudflare の Turnstile ウィジェットの許可ホスト名に、このアプリのドメインを足す
   - BPIM2 側の環境変数 `EMAIL_LINK_ALLOWED_ORIGINS` に、このアプリのオリジン（例: `https://camera.example.com`）を足す。メールのリンクの戻り先は、ここに書いたオリジンの `/signin.html` だけが許される
4. 本番の VPS（nginx の例）。`/__/auth/` には COOP/COEP を付けず、`/signin.html` も同様に付けない

```
location /__/auth/ {
    proxy_pass https://bpimv2.firebaseapp.com;
    proxy_ssl_server_name on;
    proxy_set_header Host bpimv2.firebaseapp.com;
}
location /bpim2-api/ {
    # 認証つき BPIM2 API（ユーザー名・アイコンの取得など）。CORS 非対応なので同一オリジンで中継する
    proxy_pass https://bpi2.poyashi.me/;
    proxy_ssl_server_name on;
    proxy_set_header Host bpi2.poyashi.me;
    # BPIM2 の送信制限と Turnstile の検証が、利用者の IP で行われるように
    proxy_set_header X-Forwarded-For $remote_addr;
}
location = /signin.html {
    # add_header で Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy を付けない
}
location / {
    add_header Cross-Origin-Opener-Policy same-origin;
    add_header Cross-Origin-Embedder-Policy require-corp;
}
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
