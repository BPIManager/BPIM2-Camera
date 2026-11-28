import { useEffect, useState } from "react";
import { Check, ExternalLink, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import ConfirmDialog from "@/components/confirm-dialog";
import { useBeatSeekerLink } from "@/hooks/useBeatSeekerLink";
import { BEAT_SEEKER_URL, fetchMe, looksLikeToken, normalizeToken, TOKEN_PREFIX, WRITE_SCOPE } from "@/lib/beatSeeker/client";
import { clearBeatSeekerLink, saveBeatSeekerLink } from "@/lib/beatSeeker/token";

/** トークンの発行のしかた（beat-seeker の画面での操作） */
function HowToIssue() {
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-xs leading-relaxed text-muted-foreground">
      <li>
        <a href={BEAT_SEEKER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
          beat-seeker
          <ExternalLink className="size-3" aria-hidden />
        </a>
        にログインする
      </li>
      <li>プロフィール →「外部連携トークン」→「連携トークンを管理」</li>
      <li>用途で「スコア登録も許可」を選び、有効期限を選んで発行する</li>
      <li>表示されたトークン（{TOKEN_PREFIX} で始まる文字列）をコピーして、下に貼り付ける</li>
    </ol>
  );
}

/** 権限が足りないとき（読み取り専用のトークン）の案内 */
function ReadOnlyNote() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      読み取り専用のトークンです。変動幅の確認はできますが、スコアは登録できません。「スコア登録も許可」で発行し直してください
    </p>
  );
}

/** 連携中のアカウントを GET /me で確かめた結果。checking は確認中、stale は接続できず、前回確かめた内容を出している */
type LiveStatus = { kind: "checking" } | { kind: "ok" } | { kind: "revoked" } | { kind: "stale"; message: string };

/**
 * beat-seeker との連携（トークンの入力・確認・解除）。オンボーディングと設定で使う。
 * 貼り付けたトークンを GET /me で確かめ、正しければ端末（IndexedDB）に保存する。トークンは端末の外（BPIM2 など）には送らない。
 * 連携中は、開くたびに GET /me でアカウントの情報を取り直す（表示名・権限の変更や、beat-seeker 側での失効を反映する）
 */
export default function BeatSeekerLinkPanel() {
  const link = useBeatSeekerLink();
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [live, setLive] = useState<LiveStatus>({ kind: "checking" });
  const [refresh, setRefresh] = useState(0);

  // 連携中なら、アカウントの情報を取り直す。変わっていれば保存し直す
  const token = link?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLive({ kind: "checking" });
    void fetchMe(token).then(async (r) => {
      if (!alive) return;
      if (r.kind === "ok") {
        await saveBeatSeekerLink({ token, me: r.me, verifiedAt: Date.now() });
        if (alive) setLive({ kind: "ok" });
      } else if (r.kind === "invalid") setLive({ kind: "revoked" });
      else setLive({ kind: "stale", message: r.message });
    });
    return () => {
      alive = false;
    };
  }, [token, refresh]);

  /** 貼り付けたトークンを確かめ、正しければ保存する */
  const verify = async (token: string) => {
    setChecking(true);
    setError(null);
    const r = await fetchMe(token);
    setChecking(false);
    if (r.kind === "invalid") {
      setError("トークンが無効です（失効・期限切れを含みます）。beat-seeker で発行し直してください");
      return;
    }
    if (r.kind === "error") {
      setError(r.message);
      return;
    }
    await saveBeatSeekerLink({ token, me: r.me, verifiedAt: Date.now() });
    setText("");
  };

  if (link === undefined) return null;

  if (link && live.kind !== "revoked") {
    const canWrite = link.me.scopes.includes(WRITE_SCOPE);
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check className="size-4 text-success" aria-hidden />
          beat-seeker と連携しています
        </p>
        <div className="flex flex-col gap-0.5">
          <p className="truncate text-sm font-medium">{link.me.displayName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">IIDX ID {link.me.iidxId}</p>
        </div>
        {canWrite ? <p className="text-xs text-muted-foreground">スコアの登録ができます</p> : <ReadOnlyNote />}
        {live.kind === "checking" && <p className="text-xs text-muted-foreground">beat-seeker でアカウントの情報を確かめています…</p>}
        {live.kind === "stale" && (
          <p className="text-xs text-muted-foreground">
            {live.message}。前回確かめた内容（{new Date(link.verifiedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）を表示しています
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={live.kind === "checking"} onClick={() => setRefresh((n) => n + 1)}>
            {live.kind === "checking" ? "確認しています…" : "情報を更新"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmUnlink(true)}>
            連携を解除
          </Button>
        </div>
        <ConfirmDialog
          open={confirmUnlink}
          onClose={() => setConfirmUnlink(false)}
          title="beat-seeker との連携を解除"
          description="この端末に保存したトークンを削除します。トークン自体を無効にするには、beat-seeker の「連携トークンを管理」で失効させてください。"
          confirmLabel="解除する"
          onConfirm={() => {
            setConfirmUnlink(false);
            setError(null);
            void clearBeatSeekerLink();
          }}
        />
      </div>
    );
  }

  const pasted = normalizeToken(text);
  const valid = looksLikeToken(pasted);
  return (
    <div className="flex flex-col gap-3">
      {link && live.kind === "revoked" && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 p-3">
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            保存しているトークン（{link.me.displayName}）は、失効したか期限が切れています。発行し直して、貼り付けてください
          </p>
          <Button variant="outline" size="sm" className="self-start" onClick={() => void clearBeatSeekerLink()}>
            保存しているトークンを削除
          </Button>
        </div>
      )}
      <HowToIssue />
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !checking) void verify(pasted);
        }}
      >
        <label htmlFor="beat-seeker-token" className="text-sm text-muted-foreground">
          連携トークン
        </label>
        <Input
          id="beat-seeker-token"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={`${TOKEN_PREFIX}…`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {text !== "" && !valid && <p className="text-xs text-destructive">{TOKEN_PREFIX} で始まるトークンを貼り付けてください</p>}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!valid || checking}>
          {checking ? "確認しています…" : "確認して保存"}
        </Button>
        {checking && <p className="text-xs text-muted-foreground">beat-seeker が止まっていると、起きるまで数十秒かかることがあります</p>}
      </form>
      <p className="text-xs text-muted-foreground">トークンはこの端末にだけ保存し、BPIM2 などほかのサーバーには送りません。</p>
    </div>
  );
}
