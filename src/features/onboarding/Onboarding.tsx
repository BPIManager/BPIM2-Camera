import Button from "@/components/ui/button";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import type { PlaySide } from "@/lib/storage/settings";
import { useState } from "react";

interface Props {
  ios: boolean;
  standalone: boolean;
  onDone: (result: { statsConsent: boolean; playSide: PlaySide }) => void;
}

/** 初回起動。統計の同意とカメラ許可の前置き、iOS Safari ではホーム画面追加の案内 */
export default function Onboarding({ ios, standalone, onDone }: Props) {
  const [side, setSide] = useState<PlaySide>("1P");
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">リザルトを撮って、記録する</h1>
      <p className="text-muted-foreground">
        曲名とスコアを白枠に収めて撮るか、保存した画像を選ぶと、曲とEXスコアを読み取ります。
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">プレーする側</h2>
        <p className="text-sm text-muted-foreground">リザルト画面は 1P と 2P で左右が反転します。あとから設定で変えられます。</p>
        <RadioGroup value={side} onValueChange={(v) => setSide(v as PlaySide)} aria-label="プレーする側">
          <RadioItem value="1P">1P</RadioItem>
          <RadioItem value="2P">2P</RadioItem>
        </RadioGroup>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">統計データの送信</h2>
        <p className="text-sm text-muted-foreground">
          読み取り精度の改善のため、画面部分だけを切り出して DJ NAME などを塗りつぶした画像と、読み取り結果を送れます。
          BPIM2 のアカウントとは結び付けません。あとから設定で変更できます。
        </p>
      </section>
      {ios && !standalone && (
        <p className="text-sm text-muted-foreground">
          Safari の共有ボタンから「ホーム画面に追加」すると、カメラの許可確認が減ります。
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={() => onDone({ statsConsent: true, playSide: side })}>
          送信に同意して始める
        </Button>
        <Button size="lg" variant="outline" onClick={() => onDone({ statsConsent: false, playSide: side })}>
          送信せず始める
        </Button>
      </div>
    </div>
  );
}
