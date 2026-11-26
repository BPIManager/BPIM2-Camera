import { useEffect, useRef } from "react";
import { Plus, Share } from "lucide-react";
import BrandMark from "@/components/brand-mark";
import Button from "@/components/ui/button";
import { promptInstall, type InstallMode } from "@/lib/pwa/install";
import { cn } from "@/lib/utils";

interface Props {
  mode: InstallMode;
  /** 閉じる（「あとで」・インストール後・Esc・外側のタップ） */
  onClose: () => void;
}

/** 「ホーム画面」に見立てた面に、アプリのアイコンが落ちて収まる。ぐるぐる繰り返す */
function HomeScreenAnimation() {
  return (
    <div
      aria-hidden
      className="relative mx-auto flex h-40 w-full max-w-64 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary/60"
    >
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="size-9 rounded-xl bg-muted/70" />
        ))}
      </div>
      <div className="install-drop absolute top-1/2 left-1/2 -mt-5 -ml-5">
        <BrandMark className="size-10 rounded-xl shadow-lg" />
      </div>
      <span className="install-ring absolute top-1/2 left-1/2 -mt-5 -ml-5 size-10 rounded-xl border-2 border-primary" />
    </div>
  );
}

/** iOS の手順。3 つのステップを順に光らせて、いま見るところを示す */
function IosSteps() {
  const steps = [
    {
      icon: <Share className="size-5" />,
      title: "共有ボタンをタップ",
      body: "Safari の画面の下（または上）にある、四角から矢印が出たボタンです",
    },
    {
      icon: <Plus className="size-5" />,
      title: "「ホーム画面に追加」を選ぶ",
      body: "メニューを少し上にスクロールすると出てきます",
    },
    {
      icon: <BrandMark className="size-5 rounded-md" />,
      title: "右上の「追加」をタップ",
      body: "ホーム画面のアイコンから、全画面で開けるようになります",
    },
  ];
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="install-step flex items-center gap-3 rounded-xl border border-border p-3"
          style={{ animationDelay: `${i * 2}s` }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{s.title}</span>
            <span className="block text-xs text-muted-foreground">
              {s.body}
            </span>
          </span>
          <span className="text-muted-foreground">{s.icon}</span>
        </li>
      ))}
    </ol>
  );
}

/** 全画面で使えて、カメラの許可確認も減る。アプリとして追加するための案内（モーダル） */
export default function InstallDialog({ mode, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // 親の再描画で onClose の参照が変わっても、フォーカスや Esc の登録をやり直さない
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const install = async () => {
    await promptInstall();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        aria-label="閉じる"
        tabIndex={-1}
        onClick={onClose}
        className="animate-in fade-in absolute inset-0 bg-scrim duration-200"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        className={cn(
          "animate-in fade-in slide-in-from-bottom-6 zoom-in-95 relative flex w-full max-w-sm flex-col gap-4 rounded-t-2xl border border-border bg-card p-5 text-card-foreground shadow-xl duration-300 sm:rounded-2xl",
          "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        <div className="flex flex-col gap-1 text-center">
          <h2 id="install-title" className="text-lg font-semibold">
            ホーム画面に追加しよう
          </h2>
          <p className="text-sm text-muted-foreground">
            アプリとして開くと、全画面で撮影でき、カメラの許可確認も減ります。
          </p>
        </div>

        {mode === "ios" ? <IosSteps /> : <HomeScreenAnimation />}
        {mode === "manual" && (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。
          </p>
        )}

        <div className="flex flex-col gap-2">
          {mode === "native" && (
            <Button ref={closeRef} size="lg" onClick={() => void install()}>
              インストール
            </Button>
          )}
          <Button
            ref={mode === "native" ? undefined : closeRef}
            size="lg"
            variant={mode === "native" ? "ghost" : "default"}
            onClick={onClose}
          >
            {mode === "native" ? "あとで" : "閉じる"}
          </Button>
        </div>
      </div>
    </div>
  );
}
