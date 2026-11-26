import { useEffect, useState } from "react";
import Button from "@/components/ui/button";
import type { Size } from "@/lib/vision/framing";
import { resolveLayout } from "@/lib/vision/guides";
import GuideEditor from "./GuideEditor";
import Label from "@/components/ui/label";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import Switch from "@/components/ui/switch";
import type { PlaySide } from "@/lib/storage/settings";
import { clearHistory } from "@/lib/storage/history";
import { clearSamples, countSamples, listSamples } from "@/lib/storage/samples";
import { buildTrainingZip } from "@/lib/training/exportZip";
import type { Settings } from "@/lib/storage/settings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  viewSize: Size;
}

function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsView({ settings, update, viewSize }: Props) {
  const [editingGuides, setEditingGuides] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  useEffect(() => {
    void countSamples().then(setSampleCount);
  }, []);
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-8">
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>プレーする側</Label>
        <p className="text-xs text-muted-foreground">リザルト画面は 1P と 2P で左右が反転します</p>
        <RadioGroup value={settings.playSide} onValueChange={(v) => update({ playSide: v as PlaySide })} aria-label="プレーする側">
          <RadioItem value="1P">1P</RadioItem>
          <RadioItem value="2P">2P</RadioItem>
        </RadioGroup>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-border py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Label>撮影枠の位置</Label>
          <p className="text-xs text-muted-foreground">好きなリザルト画像を背景に、スコアと曲名の枠を合わせます</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditingGuides(true)}>
          調整
        </Button>
      </div>
      {editingGuides && (
        <GuideEditor
          side={settings.playSide}
          initial={resolveLayout(settings.playSide, settings.guides)}
          viewSize={viewSize}
          onClose={() => setEditingGuides(false)}
          onSave={(layout) => {
            update({ guides: { ...settings.guides, [settings.playSide]: layout } });
            setEditingGuides(false);
          }}
        />
      )}
      <Row id="auto" label="自動撮影" hint="静止して画面が読めたら自動で読み取ります">
        <Switch id="auto" checked={settings.autoCapture} onCheckedChange={(v) => update({ autoCapture: v })} />
      </Row>
      <Row id="save" label="カメラロールへの保存" hint="iOS は共有シートで「画像を保存」を選びます">
        <Switch id="save" checked={settings.saveToCameraRoll} onCheckedChange={(v) => update({ saveToCameraRoll: v })} />
      </Row>
      <Row id="share-img" label="シェアに写真を添える" hint="オフにすると本文のみ共有します">
        <Switch
          id="share-img"
          checked={settings.shareImage === "photo"}
          onCheckedChange={(v) => update({ shareImage: v ? "photo" : "card" })}
        />
      </Row>
      <Row id="stats" label="統計データの送信" hint="匿名化した画面画像と読み取り結果を精度改善に使います">
        <Switch id="stats" checked={settings.statsConsent === true} onCheckedChange={(v) => update({ statsConsent: v })} />
      </Row>
      <Row id="stats-img" label="統計データに画像を含める">
        <Switch
          id="stats-img"
          disabled={settings.statsConsent !== true}
          checked={settings.statsIncludeImage}
          onCheckedChange={(v) => update({ statsIncludeImage: v })}
        />
      </Row>
      <Row id="bpim2" label="BPIM2へのスコア登録" hint="BPIM2 ログイン後に使えます（準備中）">
        <Switch id="bpim2" disabled checked={settings.registerToBpim2} onCheckedChange={(v) => update({ registerToBpim2: v })} />
      </Row>
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>学習データ</Label>
        <p className="text-xs text-muted-foreground">
          統計データの送信に同意していると、確認した結果と切り出した画像（スコア部・曲名帯のみ）が端末に貯まります。いま {sampleCount} 件。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={sampleCount === 0}
            onClick={async () => {
              const { blob } = await buildTrainingZip(await listSamples());
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `bpim2-camera-training-${Date.now()}.zip`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10_000);
            }}
          >
            書き出す
          </Button>
          <Button
            variant="outline"
            disabled={sampleCount === 0}
            onClick={async () => {
              if (!window.confirm("貯めた学習データを削除します。よろしいですか？")) return;
              await clearSamples();
              setSampleCount(0);
            }}
          >
            削除
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-6">
        <Button variant="outline" onClick={() => update({ deviceId: crypto.randomUUID() })}>
          端末IDをリセット
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (window.confirm("履歴をすべて削除します。よろしいですか？")) void clearHistory();
          }}
        >
          履歴を削除
        </Button>
      </div>
    </div>
  );
}
