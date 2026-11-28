import Button from "@/components/ui/button";
import type { PlaySide } from "@/lib/storage/settings";

/**
 * これまで使っていた人に、起動時に 1 回だけプレーサイド（1P・2P）を選んでもらう（#29）。
 * 選ぶまで閉じない。選んだら、次からは出さない
 */
export default function PlaySideDialog({ onChoose }: { onChoose: (side: PlaySide) => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="presentation">
      <div className="animate-in fade-in absolute inset-0 bg-scrim duration-200" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="play-side-title"
        className="animate-in fade-in slide-in-from-bottom-6 zoom-in-95 relative flex w-full max-w-sm flex-col gap-4 rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-xl duration-300 sm:rounded-2xl"
      >
        <h2 id="play-side-title" className="text-lg font-semibold">
          プレーサイドを選択
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" autoFocus onClick={() => onChoose("1P")}>
            1P
          </Button>
          <Button size="lg" onClick={() => onChoose("2P")}>
            2P
          </Button>
        </div>
      </div>
    </div>
  );
}
