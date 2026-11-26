import { ChevronLeft } from "lucide-react";
import type { Size } from "@/lib/vision/framing";
import type { Settings } from "@/lib/storage/settings";
import { cn } from "@/lib/utils";
import { CalibrateStep, ConsentStep, HowToStep, OptionsStep, SignInStep, WelcomeStep } from "./steps";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** カメラ表示領域の大きさ。キャリブレーションで同じ縦横比を使う */
  viewSize: Size;
  ios: boolean;
  standalone: boolean;
}

const STEP_COUNT = 6;

/** 初回起動のセットアップ。同意 → サインイン → キャリブレーション → 使い方 → オプション → 改善への協力 */
export default function Onboarding({ settings, update, viewSize, ios, standalone }: Props) {
  const step = Math.min(Math.max(settings.onboardStep, 0), STEP_COUNT - 1);
  const go = (n: number) => update({ onboardStep: n });
  const next = () => go(step + 1);

  return (
    <div className="mx-auto flex h-full max-w-md flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {step > 0 && (
        <header className="flex items-center gap-3 px-4 pt-3">
          <button
            type="button"
            onClick={() => go(step - 1)}
            aria-label="前のステップへ戻る"
            className="-ml-2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </button>
          <ol className="flex flex-1 gap-1.5" aria-label={`ステップ ${step} / ${STEP_COUNT - 1}`}>
            {Array.from({ length: STEP_COUNT - 1 }, (_, i) => (
              <li key={i} className={cn("h-1 flex-1 rounded-full", i < step ? "bg-primary" : "bg-border")} />
            ))}
          </ol>
        </header>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {step === 0 && <WelcomeStep onAgree={() => update({ termsAcceptedAt: Date.now(), onboardStep: 1 })} />}
        {step === 1 && <SignInStep onNext={next} />}
        {step === 2 && <CalibrateStep settings={settings} update={update} viewSize={viewSize} onNext={next} />}
        {step === 3 && <HowToStep settings={settings} onNext={next} />}
        {step === 4 && <OptionsStep settings={settings} update={update} onNext={next} ios={ios} standalone={standalone} />}
        {step === 5 && <ConsentStep onDone={(statsConsent) => update({ statsConsent, onboarded: true })} />}
      </div>
    </div>
  );
}
