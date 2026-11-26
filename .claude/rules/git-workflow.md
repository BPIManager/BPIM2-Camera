# Git運用

- 作業ブランチは `master` 一本でよい（bpim2 の `staging` 運用は採らない）。`issue-driven-development.md` / skills 内の `staging` は `master` と読み替える
- コミットは作業の粒度で細かく分ける（1コミット1目的。依存追加・設定・UI部品・ロジック・テストを混ぜない）
- GitHub issueに紐づく作業はコミットメッセージ本文に `Refs #<番号>` / `Closes #<番号>` を入れる
- `git add -A` / `git add .` は使わず、対象ファイルを明示してstageする
- コミットメッセージは `type(scope): 日本語の要約`（bpim2 と同じ形式）
