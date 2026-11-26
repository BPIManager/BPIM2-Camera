import { ExternalLink } from "lucide-react";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBpim2Profile } from "@/hooks/useBpim2Profile";
import { LATEST_VERSION } from "@/lib/bpi/client";
import SignInButtons from "@/features/auth/SignInButtons";
import { signOutUser } from "@/lib/firebase/auth";
import { scoreLogUrl } from "@/lib/links";

/** BPIM2 アカウント。サインイン中はユーザー名・アイコン・スコアログへのリンク・ログアウト、未サインインならサインインを出す */
export default function AccountSection() {
  const { user, ready } = useAuth();
  const { profile } = useBpim2Profile(user);
  if (!ready) return null;

  if (!user) {
    return (
      <section className="flex flex-col gap-3 border-b border-border py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">BPIM2 アカウント</h2>
          <p className="text-xs text-muted-foreground">サインインすると、ライバルの順位が見られ、スコアが BPIM2 へ自動で保存されます</p>
        </div>
        <SignInButtons compact />
      </section>
    );
  }

  const name = profile?.userName ?? user.displayName ?? user.email ?? user.uid;
  return (
    <section className="flex flex-col gap-3 border-b border-border py-4">
      <div className="flex items-center gap-3">
        <Avatar src={profile?.profileImage ?? null} name={name} className="size-12 text-base" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">BPIM2 にサインイン中</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={scoreLogUrl(user.uid, LATEST_VERSION)} target="_blank" rel="noreferrer">
            スコアログを開く
            <ExternalLink />
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!window.confirm("BPIM2 からログアウトします。よろしいですか？")) return;
            void signOutUser();
          }}
        >
          ログアウト
        </Button>
      </div>
    </section>
  );
}
