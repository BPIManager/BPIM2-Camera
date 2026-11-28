import { useEffect, useState } from "react";
import {
  BarChart3,
  Camera,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Link2,
  Package,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Button from "@/components/ui/button";
import type { Size } from "@/lib/vision/framing";
import { GUIDE_LAYOUTS, inferSide, resolveLayout } from "@/lib/vision/guides";
import PlaySidePicker from "@/components/play-side-picker";
import AccountSection from "./AccountSection";
import BeatSeekerLinkPanel from "@/features/beatSeeker/BeatSeekerLinkPanel";
import CameraPicker from "@/components/camera-picker";
import DebugSection from "./DebugSection";
import LicensesSection from "./LicensesSection";
import VersionInfo from "./VersionInfo";
import OcrSection from "./OcrSection";
import AssetsSection from "./AssetsSection";
import type { OcrBackend } from "@/lib/recognition/ocrSetup";
import ConfirmDialog from "@/components/confirm-dialog";
import GuideEditor from "./GuideEditor";
import Label from "@/components/ui/label";
import SyncTargetPicker from "@/components/sync-target-picker";
import Switch from "@/components/ui/switch";
import { clearHistory } from "@/lib/storage/history";
import {
  clearSamples,
  countPendingSamples,
  countSamples,
  listSamples,
} from "@/lib/storage/samples";
import { buildTrainingZip } from "@/lib/training/exportZip";
import { resolvePlaySide, type Settings } from "@/lib/storage/settings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  viewSize: Size;
  /** アプリとして追加できる（まだアプリとして開いていない）か */
  installable: boolean;
  onOpenInstall: () => void;
  /** いま使っている読み取りの処理（取得済みのモデルのうち、どれを使っているかの判断に使う）。分かるまでは null */
  ocrBackend: OcrBackend | null;
}

type PageProps = Pick<Props, "settings" | "update">;

function Row({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

/** アカウント連携：BPIM2・beat-seeker の各ページへの一覧と、両方に共通の同期先 */
function AccountPage({
  settings,
  update,
  onOpen,
}: PageProps & { onOpen: (key: PageKey) => void }) {
  return (
    <>
      <PageMenu parent="account" onOpen={onOpen} />
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>同期先（既定）</Label>
        <p className="text-xs text-muted-foreground">
          結果画面で同期するときに、スコアを保存するバージョンです。結果画面では、1
          件ごとに変えられます。beat-seeker は最新バージョンだけに登録できます
        </p>
        <SyncTargetPicker
          value={settings.syncTarget}
          onChange={(syncTarget) => update({ syncTarget })}
        />
      </div>
    </>
  );
}

/** アカウント連携 › BPIM2：アカウント */
function Bpim2Page() {
  return <AccountSection />;
}

/** アカウント連携 › beat-seeker：連携トークン */
function BeatSeekerPage() {
  return (
    <section className="flex flex-col gap-3 py-4">
      <p className="text-xs text-muted-foreground">
        beat-seekerと連携すると、読み取ったスコアで BEAT-PT・BEAT-TIER
        の変動確認ができ、beat-seeker にスコアを送信できます。
      </p>
      <BeatSeekerLinkPanel />
    </section>
  );
}

/** カメラ設定：撮影枠・プレーサイド・カメラ・自動撮影・撮った写真の扱い */
function CameraPage({
  settings,
  update,
  viewSize,
}: PageProps & { viewSize: Size }) {
  const [editingGuides, setEditingGuides] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-border py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Label>撮影枠の位置</Label>
          <p className="text-xs text-muted-foreground">
            好きなリザルト画像を背景に、スコア・曲名・判定の枠を合わせます
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditingGuides(true)}
        >
          調整
        </Button>
      </div>
      {editingGuides && (
        <GuideEditor
          initial={resolveLayout(settings.layout, resolvePlaySide(settings))}
          defaultLayout={GUIDE_LAYOUTS[resolvePlaySide(settings)]}
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
        <Label>プレーサイド</Label>
        <p className="text-xs text-muted-foreground">
          2P
          のリザルト画面は、スコア・判定の欄が右、曲名が左下になります。自動は、撮影枠の位置から判断します
        </p>
        <PlaySidePicker
          value={settings.playSide}
          inferred={settings.layout ? inferSide(settings.layout) : "1P"}
          onChange={(playSide) => update({ playSide, playSideChosen: true })}
        />
      </div>
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>使うカメラ</Label>
        <p className="text-xs text-muted-foreground">
          変えると、枠の位置がずれることがあります。そのときは枠を調整し直してください
        </p>
        <CameraPicker
          value={settings.cameraId}
          onChange={(cameraId) => update({ cameraId })}
        />
      </div>
      <Row
        id="auto"
        label="自動撮影"
        hint="枠に画面を合わせて静止すると、自動で読み取ります"
      >
        <Switch
          id="auto"
          checked={settings.autoCapture}
          onCheckedChange={(v) => update({ autoCapture: v })}
        />
      </Row>
      <Row
        id="save"
        label="カメラロールへの保存"
        hint="iOS は共有シートで「画像を保存」を選びます"
      >
        <Switch
          id="save"
          checked={settings.saveToCameraRoll}
          onCheckedChange={(v) => update({ saveToCameraRoll: v })}
        />
      </Row>
      <Row
        id="share-img"
        label="シェアに写真を添える"
        hint="オフにすると本文のみ共有します"
      >
        <Switch
          id="share-img"
          checked={settings.shareImage === "photo"}
          onCheckedChange={(v) => update({ shareImage: v ? "photo" : "card" })}
        />
      </Row>
    </>
  );
}

/** 統計データ：送信の同意・学習データ・端末 ID */
function StatsPage({ settings, update }: PageProps) {
  const [sampleCount, setSampleCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void countSamples().then(setSampleCount);
    void countPendingSamples().then(setPendingCount);
  }, []);
  return (
    <>
      <Row
        id="stats"
        label="統計データの送信"
        hint="撮影した写真と読み取り結果を精度改善に使います"
      >
        <Switch
          id="stats"
          checked={settings.statsConsent === true}
          onCheckedChange={(v) => update({ statsConsent: v })}
        />
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
          統計データの送信に同意していると、確認した結果と切り出した画像（スコア部・曲名帯のみ）が端末に貯まります。いま{" "}
          {sampleCount} 件（未送信 {pendingCount}{" "}
          件）。送信はオンラインのときに自動で行います。
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
            onClick={() => setConfirm(true)}
          >
            削除
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-b border-border py-3">
        <Label>端末ID</Label>
        <p className="text-xs text-muted-foreground">
          統計データに付ける、この端末の ID
          です。リセットすると、これから送るデータは別の端末のものとして扱われます
        </p>
        <Button
          variant="outline"
          onClick={() => update({ deviceId: crypto.randomUUID() })}
        >
          端末IDをリセット
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="学習データを削除"
        description="貯めた学習データを削除します。送信前のものも消え、元に戻せません。"
        confirmLabel="削除する"
        destructive
        onConfirm={async () => {
          setConfirm(false);
          await clearSamples();
          setSampleCount(0);
          setPendingCount(0);
        }}
      />
    </>
  );
}

type PageKey =
  | "account"
  | "bpim2"
  | "beatSeeker"
  | "camera"
  | "ocr"
  | "models"
  | "stats";

interface PageInfo {
  key: PageKey;
  title: string;
  hint: string;
  icon: LucideIcon;
  /** 親のページ（戻る先）。トップの一覧に出すページは null */
  parent: PageKey | null;
}

const PAGES: readonly PageInfo[] = [
  {
    key: "account",
    title: "アカウント連携",
    hint: "BPIM2・beat-seeker・同期先",
    icon: UserRound,
    parent: null,
  },
  {
    key: "camera",
    title: "カメラ設定",
    hint: "撮影枠・プレーサイド・カメラ・自動撮影・保存と共有",
    icon: Camera,
    parent: null,
  },
  {
    key: "ocr",
    title: "読み取り設定",
    hint: "読み取りの処理（GPU / CPU）",
    icon: Cpu,
    parent: null,
  },
  {
    key: "models",
    title: "モデル",
    hint: "取得済みのモデル・削除",
    icon: Package,
    parent: null,
  },
  {
    key: "stats",
    title: "統計データ",
    hint: "送信の同意・学習データ・端末ID",
    icon: BarChart3,
    parent: null,
  },
  {
    key: "bpim2",
    title: "BPIM2",
    hint: "サインイン・スコアログ",
    icon: UserRound,
    parent: "account",
  },
  {
    key: "beatSeeker",
    title: "beat-seeker",
    hint: "連携トークン",
    icon: Link2,
    parent: "account",
  },
];

/** ページの一覧（押すとそのページを開く） */
function PageMenu({
  parent,
  onOpen,
}: {
  parent: PageKey | null;
  onOpen: (key: PageKey) => void;
}) {
  return (
    <nav className="flex flex-col">
      {PAGES.filter((p) => p.parent === parent).map(
        ({ key, title, hint, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpen(key)}
            className="flex items-center gap-3 border-b border-border py-3 text-left"
          >
            <Icon
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {hint}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>
        ),
      )}
    </nav>
  );
}

/** 設定。トップは各ページへの一覧と、ページに分けるほどでない項目。ページは上の「‹ 親のページ」で戻る（アカウント連携は、さらに BPIM2・beat-seeker に分ける） */
export default function SettingsView({
  settings,
  update,
  viewSize,
  installable,
  onOpenInstall,
  ocrBackend,
}: Props) {
  const [page, setPage] = useState<PageKey | null>(null);
  const [confirmHistory, setConfirmHistory] = useState(false);
  const current = PAGES.find((p) => p.key === page);

  if (current) {
    const back = current.parent
      ? PAGES.find((p) => p.key === current.parent)
      : undefined;
    return (
      <div className="flex h-full flex-col overflow-y-auto px-4 pb-8">
        <div className="sticky top-0 z-10 -mx-4 flex items-center gap-1 border-b border-border bg-background px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(current.parent)}
            className="gap-0.5 px-2"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back?.title ?? "設定"}
          </Button>
          <h2 className="text-sm font-semibold">{current.title}</h2>
        </div>
        {current.key === "account" && (
          <AccountPage settings={settings} update={update} onOpen={setPage} />
        )}
        {current.key === "bpim2" && <Bpim2Page />}
        {current.key === "beatSeeker" && <BeatSeekerPage />}
        {current.key === "camera" && (
          <CameraPage settings={settings} update={update} viewSize={viewSize} />
        )}
        {current.key === "ocr" && (
          <OcrSection settings={settings} update={update} />
        )}
        {current.key === "models" && (
          <AssetsSection
            ctx={
              ocrBackend
                ? { backend: ocrBackend, autoCapture: settings.autoCapture }
                : null
            }
          />
        )}
        {current.key === "stats" && (
          <StatsPage settings={settings} update={update} />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-8">
      <PageMenu parent={null} onOpen={setPage} />
      {installable && (
        <div className="flex items-center justify-between gap-4 border-b border-border py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Label>ホーム画面に追加</Label>
            <p className="text-xs text-muted-foreground">
              アプリとして開くと、全画面で撮影でき、カメラの許可確認も減ります
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenInstall}>
            方法を見る
          </Button>
        </div>
      )}
      <Row
        id="debug"
        label="デバッグモード"
        hint="オンにすると、OCR の読み取り結果（JSON）を、この画面の一番下で確認できます"
      >
        <Switch
          id="debug"
          checked={settings.debugMode}
          onCheckedChange={(v) => update({ debugMode: v })}
        />
      </Row>
      <LicensesSection />
      <div className="flex flex-col gap-2 pt-6">
        <Button variant="destructive" onClick={() => setConfirmHistory(true)}>
          履歴を削除
        </Button>
      </div>
      {settings.debugMode && <DebugSection />}
      <VersionInfo />
      <ConfirmDialog
        open={confirmHistory}
        onClose={() => setConfirmHistory(false)}
        title="履歴をすべて削除"
        description="撮影した結果の履歴をすべて削除します。元に戻せません。"
        confirmLabel="削除する"
        destructive
        onConfirm={() => {
          setConfirmHistory(false);
          void clearHistory();
        }}
      />
    </div>
  );
}
