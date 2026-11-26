import { useEffect, useState } from "react";
import Button from "@/components/ui/button";
import type { Size } from "@/lib/vision/framing";
import { resolveLayout } from "@/lib/vision/guides";
import AccountSection from "./AccountSection";
import CameraPicker from "@/components/camera-picker";
import DebugSection from "./DebugSection";
import LicensesSection from "./LicensesSection";
import ConfirmDialog from "@/components/confirm-dialog";
import GuideEditor from "./GuideEditor";
import Label from "@/components/ui/label";
import SyncTargetPicker from "@/components/sync-target-picker";
import Switch from "@/components/ui/switch";
import { clearHistory } from "@/lib/storage/history";
import { clearSamples, countPendingSamples, countSamples, listSamples } from "@/lib/storage/samples";
import { buildTrainingZip } from "@/lib/training/exportZip";
import type { Settings } from "@/lib/storage/settings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  viewSize: Size;
  /** アプリとして追加できる（まだアプリとして開いていない）か */
  installable: boolean;
  onOpenInstall: () => void;
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

export default function SettingsView({ settings, update, viewSize, installable, onOpenInstall }: Props) {
  const [editingGuides, setEditingGuides] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirm, setConfirm] = useState<"samples" | "history" | null>(null);
  useEffect(() => {
    void countSamples().then(setSampleCount);
    void countPendingSamples().then(setPendingCount);
  }, []);
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-8">
      <AccountSection />
      {installable && (
        <div className="flex items-center justify-between gap-4 border-b border-border py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Label>ホーム画面に追加</Label>
            <p className="text-xs text-muted-foreground">アプリとして開くと、全画面で撮影でき、カメラの許可確認も減ります</p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenInstall}>
            方法を見る
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-b border-border py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Label>撮影枠の位置</Label>
          <p className="text-xs text-muted-foreground">好きなリザルト画像を背景に、スコア・曲名・判定の枠を合わせます</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditingGuides(true)}>
          調整
        </Button>
      </div>
      {editingGuides && (
        <GuideEditor
          initial={resolveLayout(settings.layout)}
          initialAspect={settings.layoutAspect}
          viewSize={viewSize}
          onClose={() => setEditingGuides(false)}
          onSave={(layout, layoutAspect) => {
            update({ layout, layoutAspect });
            setEditingGuides(false);
          }}
        />
      )}
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>BPIM2 の同期先（既定）</Label>
        <p className="text-xs text-muted-foreground">結果画面の「BPIM2同期」で保存する先です。結果画面では、1 件ごとに変えられます</p>
        <SyncTargetPicker value={settings.syncTarget} onChange={(syncTarget) => update({ syncTarget })} />
      </div>
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>使うカメラ</Label>
        <p className="text-xs text-muted-foreground">変えると、枠の位置がずれることがあります。そのときは枠を調整し直してください</p>
        <CameraPicker value={settings.cameraId} onChange={(cameraId) => update({ cameraId })} />
      </div>
      <Row id="auto" label="自動撮影" hint="枠に画面を合わせて静止すると、自動で読み取ります">
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
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>学習データ</Label>
        <p className="text-xs text-muted-foreground">
          統計データの送信に同意していると、確認した結果と切り出した画像（スコア部・曲名帯のみ）が端末に貯まります。いま {sampleCount} 件（未送信 {pendingCount} 件）。送信はオンラインのときに自動で行います。
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
            onClick={() => setConfirm("samples")}
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
          onClick={() => setConfirm("history")}
        >
          履歴を削除
        </Button>
      </div>
      <Row id="debug" label="デバッグモード" hint="オンにすると、OCR の読み取り結果（JSON）を、この画面の一番下で確認できます">
        <Switch id="debug" checked={settings.debugMode} onCheckedChange={(v) => update({ debugMode: v })} />
      </Row>
      <LicensesSection />
      {settings.debugMode && <DebugSection />}
      <ConfirmDialog
        open={confirm === "samples"}
        onClose={() => setConfirm(null)}
        title="学習データを削除"
        description="貯めた学習データを削除します。送信前のものも消え、元に戻せません。"
        confirmLabel="削除する"
        destructive
        onConfirm={async () => {
          setConfirm(null);
          await clearSamples();
          setSampleCount(0);
          setPendingCount(0);
        }}
      />
      <ConfirmDialog
        open={confirm === "history"}
        onClose={() => setConfirm(null)}
        title="履歴をすべて削除"
        description="撮影した結果の履歴をすべて削除します。元に戻せません。"
        confirmLabel="削除する"
        destructive
        onConfirm={() => {
          setConfirm(null);
          void clearHistory();
        }}
      />
    </div>
  );
}
