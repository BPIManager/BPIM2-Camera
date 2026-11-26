import { Mail } from "lucide-react";
import { GoogleIcon, LineIcon, XIcon } from "@/components/brand-icons";
import Button from "@/components/ui/button";
import { startSignIn, type SignInProvider } from "@/lib/firebase/auth";
import { cn } from "@/lib/utils";

/** 各サービスの色（ブランドの色を、globals.css のトークンから使う） */
const PROVIDERS: { id: SignInProvider; label: string; Icon: typeof GoogleIcon; tone: string }[] = [
  { id: "google", label: "Google でサインイン", Icon: GoogleIcon, tone: "bg-brand-google text-brand-google-foreground hover:bg-brand-google/90" },
  { id: "twitter", label: "X でサインイン", Icon: XIcon, tone: "border border-border bg-brand-x text-brand-x-foreground hover:bg-brand-x/80" },
  { id: "line", label: "LINE でサインイン", Icon: LineIcon, tone: "bg-brand-line text-brand-line-foreground hover:bg-brand-line/90" },
];

/**
 * Google / X / LINE / メールのサインインボタン。どれも signin.html で行い、終わるとこの画面に戻る。
 * メールは、signin.html でアドレスを入力し、Turnstile を通して、サインイン用のリンクを送ってもらう。
 */
export default function SignInButtons({ compact = false, returnTo = "/" }: { compact?: boolean; returnTo?: string }) {
  const size = compact ? "default" : "lg";
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-1")}>
      {PROVIDERS.map(({ id, label, Icon, tone }) => (
        <Button key={id} size={size} className={cn("gap-3", tone)} onClick={() => startSignIn(id, returnTo)}>
          <Icon className="size-5" />
          {compact ? label.replace(" でサインイン", "") : label}
        </Button>
      ))}
      <Button size={size} variant="secondary" className="gap-3" onClick={() => startSignIn("email", returnTo)}>
        <Mail className="size-5" />
        {compact ? "メール" : "メールでサインイン"}
      </Button>
    </div>
  );
}
