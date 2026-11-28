import { useState } from "react";
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

/**
 * beat-seeker との連携（トークンの入力・確認・解除）。オンボーディングと設定で使う。
 * 貼り付けたトークンを GET /me で確かめ、正しければ端末（IndexedDB）に保存する。トークンは端末の外（BPIM2 など）には送らない
 */
export default function BeatSeekerLinkPanel() {
  const link = useBeatSeekerLink();
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  /** トークンを確かめ、正しければ保存する。確かめ直すときは、保存済みのトークンを渡す */
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

  if (link) {
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
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={checking} onClick={() => void verify(link.token)}>
            {checking ? "確認しています…" : "確認し直す"}
          </Button>
          <Button variant="outline" size="sm" disabled={checking} onClick={() => setConfirmUnlink(true)}>
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

  const token = normalizeToken(text);
  const valid = looksLikeToken(token);
  return (
    <div className="flex flex-col gap-3">
      <HowToIssue />
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !checking) void verify(token);
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
