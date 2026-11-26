import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import BrandMark from "@/components/brand-mark";
import SyncTargetPicker from "@/components/sync-target-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Avatar from "@/components/ui/avatar";
import Button from "@/components/ui/button";
import Label from "@/components/ui/label";
import Switch from "@/components/ui/switch";
import SignInButtons from "@/features/auth/SignInButtons";
import GuideEditor from "@/features/settings/GuideEditor";
import { AlignAnimation, CalibrateAnimation } from "./StepAnimations";
import { useAuth } from "@/hooks/useAuth";
import { useBpim2Profile } from "@/hooks/useBpim2Profile";
import { signOutUser } from "@/lib/firebase/auth";
import { emailLinkErrorMessage } from "@/lib/firebase/email";
import { PRIVACY_URL, TERMS_URL } from "@/lib/links";
import type { Settings } from "@/lib/storage/settings";
import type { Size } from "@/lib/vision/framing";
import { resolveLayout, type GuideLayout } from "@/lib/vision/guides";

function Frame({
  title,
  lead,
  children,
  actions,
}: {
  title: string;
  lead?: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col gap-6">
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        {lead && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {lead}
          </p>
        )}
        {children}
      </div>
      {/* 内容が長くてスクロールするときも、ボタンは下に固定する（親の p-6 を打ち消して端まで背景を敷く） */}
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 bg-background px-6 pt-3 pb-6">
        {actions}
      </div>
    </div>
  );
}

/** ① ロゴ・利用規約とプライバシーポリシーへのリンク・同意して始める */
export function WelcomeStep({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="flex min-h-full flex-col justify-between gap-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <BrandMark />
        <h1 className="text-2xl font-semibold">BPIM2 Camera</h1>
        <p className="text-sm text-muted-foreground">
          リザルト画面の撮影をもっと便利に
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          ご利用いただくにあたり、
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            利用規約
          </a>
          と
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            プライバシーポリシー
          </a>
          に同意したものとみなします。
        </p>
        <Button size="lg" onClick={onAgree}>
          同意して始める
        </Button>
      </div>
    </div>
  );
}

const AUTH_ERRORS: Record<string, string> = {
  "auth/account-exists-with-different-credential":
    "同じメールアドレスで、別の方法で登録済みです。BPIM2 で使っている方法でサインインしてください",
  "auth/unauthorized-domain":
    "このアプリの URL が、サインインの許可リストにありません",
  // メールリンクを開いて完了するときのエラー
  "auth/invalid-action-code": emailLinkErrorMessage("auth/invalid-action-code"),
  "auth/expired-action-code": emailLinkErrorMessage("auth/expired-action-code"),
  "auth/invalid-email": emailLinkErrorMessage("auth/invalid-email"),
};

/**
 * サインイン画面から戻ったときの authError を読み、アドレスから消す。
 * StrictMode は state の初期化関数を 2 回呼ぶ（2 回目は消した後で取れない）ので、読み込み時に 1 回だけ行う。
 */
const initialAuthError: string | null = (() => {
  const url = new URL(location.href);
  const code = url.searchParams.get("authError");
  if (!code) return null;
  url.searchParams.delete("authError");
  history.replaceState(null, "", url);
  return `${AUTH_ERRORS[code] ?? "サインインできませんでした。もう一度お試しください"}（${code}）`;
})();

/** ② BPIM2 アカウントでのサインイン（スキップ可）。BPIM2 本体と同じ Firebase のアカウントを使う */
export function SignInStep({ onNext }: { onNext: () => void }) {
  const { user, ready } = useAuth();
  const { profile } = useBpim2Profile(user);
  const error = initialAuthError;
  const name =
    profile?.userName ?? user?.displayName ?? user?.email ?? user?.uid ?? "";
  return (
    <Frame
      title="BPIM2 にサインイン"
      lead="サインインすると、ライバルの順位が見られ、読み取ったスコアを BPIM2 へワンタップで同期できます。サインインしなくても撮影・読み取りは使えます。"
      actions={
        user ? (
          <Button size="lg" onClick={onNext}>
            次へ
          </Button>
        ) : null
      }
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!ready ? null : user ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Check className="size-4 text-success" />
            サインインしました
          </p>
          <div className="flex items-center gap-3">
            <Avatar src={profile?.profileImage ?? null} name={name} />
            <p className="truncate text-sm font-medium">{name}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => void signOutUser()}
          >
            サインアウト
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <SignInButtons />
          {/* サインインしなくても使える。ボタンの並びの下に、目立たないリンクで置く */}
          <button
            type="button"
            onClick={onNext}
            className="self-center py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            サインインせずに進む
          </button>
        </div>
      )}
    </Frame>
  );
}

/** ③ 好きなリザルト画面の写真に合わせて、スコア・曲名・判定内訳の位置を決める */
export function CalibrateStep({
  settings,
  update,
  viewSize,
  onNext,
}: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  viewSize: Size;
  onNext: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const done = settings.layout !== null;
  return (
    <Frame
      title="撮影位置を合わせる"
      lead="カメラロールから、リザルト画面の写真を 1 枚選んでください。写真の上で、スコア・曲名・判定内訳の枠を、その場所に合わせます。楽曲名やスコアを正確に読み取るため、ここで決めた位置が実際に撮影する際の撮影アングルの基準になります。"
      actions={
        <>
          <Button
            size="lg"
            variant={done ? "outline" : "default"}
            onClick={() => setEditing(true)}
          >
            {done ? "やり直す" : "写真を選んで合わせる"}
          </Button>
          {done ? (
            <Button size="lg" onClick={onNext}>
              次へ
            </Button>
          ) : (
            <Button size="lg" variant="ghost" onClick={onNext}>
              あとで設定する（標準の位置を使う）
            </Button>
          )}
        </>
      }
    >
      <CalibrateAnimation />
      {done && (
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check className="size-4 text-success" />
          撮影位置を設定しました。設定画面からいつでも変えられます
        </p>
      )}
      {editing && (
        <GuideEditor
          title="撮影位置を合わせる"
          closeLabel="戻る"
          saveLabel="この位置で決定"
          requireImage
          initial={resolveLayout(settings.layout)}
          initialAspect={settings.layoutAspect}
          viewSize={viewSize}
          onClose={() => setEditing(false)}
          onSave={(layout: GuideLayout, layoutAspect) => {
            update({ layout, layoutAspect });
            setEditing(false);
          }}
        />
      )}
    </Frame>
  );
}

/** ④ 撮影のしかた。キャリブレーションした枠を、実際の配置で見せる */
export function HowToStep({
  settings,
  onNext,
}: {
  settings: Settings;
  onNext: () => void;
}) {
  const layout = resolveLayout(settings.layout);
  return (
    <Frame
      title="撮影のしかた"
      lead="選んだ写真と同じ構図になるように、さきほど合わせた枠にリザルト画面を重ねて撮影します。"
      actions={
        <Button size="lg" onClick={onNext}>
          次へ
        </Button>
      }
    >
      <h2 className="text-base font-semibold">撮影のコツ</h2>
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>楽曲名の読み取り</AlertTitle>
        <AlertDescription>
          <p>曲名は端が見切れても構いません。</p>
          <p>
            ANOTHER
            などの難易度表記とレベル、ノーツ数は、枠の外にはみ出さないように収めてください。
          </p>
        </AlertDescription>
      </Alert>
      <Alert variant="info">
        <TriangleAlert />
        <AlertTitle>スコアの読み取り</AlertTitle>
        <AlertDescription>
          <p>今回更新したスコアが全て枠の中に入るように収めてください。</p>
          <p>ベストスコアなど他の文字が写っていても読み取れます</p>
        </AlertDescription>
      </Alert>
      <AlignAnimation
        layout={layout}
        aspect={settings.layoutAspect ?? 9 / 16}
      />
    </Frame>
  );
}

function OptionRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** ⑤ 自動読み取り（自動撮影）とカメラロールへの自動保存。BPIM2 への保存は、結果画面の「BPIM2同期」ボタンで 1 曲ずつ行う */
export function OptionsStep({
  settings,
  update,
  onNext,
}: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onNext: () => void;
}) {
  const [auto, setAuto] = useState(settings.autoCapture);
  const [save, setSave] = useState(settings.saveToCameraRoll);
  const [syncTarget, setSyncTarget] = useState(settings.syncTarget);
  return (
    <Frame
      title="撮影と保存のしかた"
      lead="あとから設定で変更することもできます。"
      actions={
        <Button
          size="lg"
          onClick={() => {
            update({ autoCapture: auto, saveToCameraRoll: save, syncTarget });
            onNext();
          }}
        >
          次へ
        </Button>
      }
    >
      <div className="flex flex-col">
        <OptionRow
          id="opt-auto"
          label="自動で読み取る"
          hint="枠に画面を合わせて静止すると、自動で撮影・読み取りします。環境によっては正常に動作しない場合があります"
        >
          <Switch id="opt-auto" checked={auto} onCheckedChange={setAuto} />
        </OptionRow>
        <OptionRow
          id="opt-roll"
          label="カメラロールへ自動保存"
          hint="iPhoneの場合は共有シートで「画像を保存」をタップ"
        >
          <Switch id="opt-roll" checked={save} onCheckedChange={setSave} />
        </OptionRow>
        <div className="flex flex-col gap-2 py-3">
          <Label>BPIM2 の同期先（既定）</Label>
          <p className="text-xs text-muted-foreground">
            デフォルトの同期先を選択してください。
            (結果画面で1件ごとに変えることもできます)
          </p>
          <SyncTargetPicker value={syncTarget} onChange={setSyncTarget} />
        </div>
      </div>
    </Frame>
  );
}

/** ⑥ 読み取り精度の改善への協力 */
export function ConsentStep({
  onDone,
}: {
  onDone: (statsConsent: boolean) => void;
}) {
  return (
    <Frame
      title="読み取りの改善にご協力ください"
      actions={
        <>
          <Button size="lg" onClick={() => onDone(true)}>
            協力して始める
          </Button>
          <Button size="lg" variant="outline" onClick={() => onDone(false)}>
            協力せず始める
          </Button>
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-3 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>曲名及びスコアの判定結果を文字と画像で保存します。</li>
        <li>
          スコアや曲名の自動判定に失敗した場合、手動で入力された正しい曲名・スコアを共有します。
        </li>
        <li>
          誰がアップロードしたか分からない形で保存されます（画像への映り込みを除く）。
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        あとから設定で変更できます。
      </p>
    </Frame>
  );
}
