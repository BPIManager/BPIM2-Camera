const REPO = "https://github.com/BPIManager/BPIM2-Camera";

/** コミットの日時を、端末の時刻で「2026/11/28 17:05」の形にする */
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** 設定の一番下に出す、ビルドした版（最後のコミット）。不具合の報告のときに、どの版かを伝えてもらう */
export default function VersionInfo() {
  const { commit, date, dirty } = __APP_VERSION__;
  const known = commit !== "unknown";
  return (
    <p className="pt-6 pb-2 text-center text-xs text-muted-foreground">
      バージョン{" "}
      {known ? (
        <a href={`${REPO}/commit/${commit}`} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-2">
          {commit}
        </a>
      ) : (
        <span className="font-mono">{commit}</span>
      )}
      {dirty && <span className="font-mono">（未コミットの変更あり）</span>}
      {date && <span>（{formatDate(date)}）</span>}
    </p>
  );
}
