/** ビルドした版の情報。vite.config の define が、ビルドのときに埋め込む */
declare const __APP_VERSION__: {
  /** 最後のコミットのハッシュ（短縮形）。分からなければ unknown */
  commit: string;
  /** 最後のコミットの日時（ISO 8601）。分からなければ null */
  date: string | null;
  /** コミットしていない変更を含めてビルドした */
  dirty: boolean;
};
