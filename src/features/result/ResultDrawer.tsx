import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronUp,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import Badge from "@/components/ui/badge";
import DifficultyBadge from "@/components/ui/difficulty-badge";
import Skeleton from "@/components/ui/skeleton";
import Button from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import Input from "@/components/ui/input";
import ResultDetails from "./ResultDetails";
import Label from "@/components/ui/label";
import { REFERENCE_VERSION } from "@/lib/bpi/client";
import { useAuth } from "@/hooks/useAuth";
import { useBpim2Profile } from "@/hooks/useBpim2Profile";
import { useBpimSync } from "@/hooks/useBpimSync";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import {
  syncTargetLabel,
  syncVersionOf,
  type SyncTarget,
} from "@/lib/bpi/syncTarget";
import { useRemote } from "@/hooks/useRemote";
import {
  fetchHistory,
  personalBestDiff,
  personalBestEntry,
  type SelfInfo,
} from "@/lib/bpi/songData";
import { saveResult } from "@/lib/storage/history";
import { confirmSample } from "@/lib/storage/samples";
import { flushIfEnabled } from "@/lib/training/upload";
import { saveImage } from "@/lib/share/save";
import { shareResult } from "@/lib/share/share";
import { buildShareText } from "@/lib/share/text";
import type { SongMasterEntry } from "@/lib/songs/types";
import type { Settings } from "@/lib/storage/settings";
import type { Draft } from "./draft";
import SongPicker from "./SongPicker";
import SyncChip from "./SyncChip";
import SyncTargetMenu from "./SyncTargetMenu";
import SongTabs from "./SongTabs";
import { useResultEditor } from "./useResultEditor";

interface Props {
  draft: Draft;
  songs: readonly SongMasterEntry[];
  settings: Settings;
  onClose: () => void;
}

export default function ResultDrawer({
  draft,
  songs,
  settings,
  onClose,
}: Props) {
  const ed = useResultEditor(draft, REFERENCE_VERSION);
  useKeyboardInset();
  const [editing, setEditing] = useState(ed.chart === null);
  const candidates = (draft.resolution?.candidates ?? []).map((c) => c.entry);

  // 過去の自己スコアは、曲が決まった時点で取る（サインイン中のみ）。自己歴代の判定と履歴タブに使う
  const { user } = useAuth();
  const { profile } = useBpim2Profile(user);
  const chart = ed.chart;
  const history = useRemote(
    user && chart ? `history:${user.uid}:${chart.songId}` : null,
    () => fetchHistory(user!.uid, chart!),
  );
  const bestEntry = personalBestEntry(history.data);
  const best = bestEntry?.exScore ?? null;
  // 自己ベストを出したバージョン（数字のときだけ。例: 33）
  const bestVersion =
    bestEntry?.version && /^\d+$/.test(bestEntry.version)
      ? `(${bestEntry.version})`
      : "";
  // 過去の自己ベストとの差。下回ったとき（マイナス）も常に出す。初プレー（記録なし）のときだけ出さない
  const diff = ed.record ? personalBestDiff(ed.record.exScore, best) : null;
  const self: SelfInfo | null = user
    ? {
        userId: user.uid,
        userName: profile?.userName ?? user.displayName ?? "あなた",
        profileImage: profile?.profileImage ?? null,
      }
    : null;

  // 読み取ったスコアの BPIM2 への保存は、ボタンを押したときだけ（自動では送らない）。曲名の横に状況を出す
  // 保存先。既定は設定のもの。この結果だけ、同期ボタンの矢印から変えられる
  const [syncTarget, setSyncTarget] = useState<SyncTarget>(settings.syncTarget);
  const [targetMenuOpen, setTargetMenuOpen] = useState(false);
  const sync = useBpimSync(
    user?.uid ?? null,
    ed.chart,
    ed.record?.exScore ?? null,
    syncVersionOf(syncTarget),
    // 使用オプションとミスカウントも送る。ミスカウントが分からなければ、BPIM2 は最新の記録の値を引き継ぐ
    { useOption: ed.record?.useOption ?? null, missCount: ed.record?.missCount ?? null },
  );

  const commit = async () => {
    if (!ed.record) return;
    await saveResult(ed.record, draft.image);
    // 読み取りが終わった時点で貯めた学習サンプルに、確認済みの値を正解ラベルとして足し、送り直す
    if (settings.statsConsent === true && draft.regions) {
      const label = {
        chart: ed.record.chart,
        exScore: ed.record.exScore,
        autoConfirmed: ed.record.correctedFields.length === 0 && draft.resolution?.autoConfirm === true,
        correctedFields: ed.record.correctedFields,
        useOption: ed.record.useOption,
        missCount: ed.record.missCount,
        fast: ed.record.fast ?? null,
        slow: ed.record.slow ?? null,
      };
      // 確定の操作は待たせない
      void confirmSample(draft.id, label)
        .then(() => flushIfEnabled(settings))
        .catch(() => undefined);
    }
  };

  // 画像の保存。自動保存が有効なら、結果の画面が開いた時点で保存する（閉じるときや、シェアのときではなく）。
  // 保存できた（保存の流れに渡せた）ときだけ「保存済み」にする。iOS は、操作の直後でないと共有シートを開けないので、自動では保存できない
  const [imageName] = useState(() => `iidx-${Date.now()}.jpg`);
  const [saved, setSaved] = useState(false);
  const autoSaveStarted = useRef(false);
  useEffect(() => {
    // 開発時の StrictMode は effect を 2 回実行する。2 回保存しないよう、始めたかどうかを覚えておく
    if (
      autoSaveStarted.current ||
      !settings.saveToCameraRoll ||
      draft.source !== "camera"
    )
      return;
    autoSaveStarted.current = true;
    void saveImage(draft.image, imageName).then((ok) => ok && setSaved(true));
  }, [draft, imageName, settings.saveToCameraRoll]);
  const closeAndSave = async () => {
    await commit();
    onClose();
  };

  const iconButton = "size-8 shrink-0 text-muted-foreground";
  const bpiIsNumber =
    ed.record?.bpiStatus === "calculated" && ed.record.bpi !== null;
  const bpiText = !ed.record
    ? "—"
    : ed.record.bpiStatus === "calculated"
      ? (ed.record.bpi?.toFixed(2) ?? "—")
      : ed.record.bpiStatus === "unsupported-level"
        ? "対象外"
        : ed.record.bpiStatus === "pending"
          ? "未算出"
          : "—";
  const rankText =
    ed.record?.estimatedRank != null ? `${ed.record.estimatedRank}位` : "—";
  const diffText =
    diff === null ? "" : diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "±0";

  return (
    <Drawer open dismissible={false}>
      {/* 曲が決まったら、背の高いシートにして、タブの中身だけをスクロールさせる（シート自体は動かない） */}
      <DrawerContent className={cn(ed.record && "h-[85dvh]")}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              "flex flex-col gap-3 overflow-y-auto overscroll-contain p-4",
              ed.record ? "max-h-[55%] shrink-0 pb-2" : "flex-1",
            )}
          >
            <header className="flex flex-col gap-1">
              <div className="flex items-start gap-1">
                <DrawerTitle className="min-w-0 flex-1 text-lg font-semibold">
                  {ed.chart?.title ?? "曲を選んでください"}
                </DrawerTitle>
                <SyncChip
                  status={sync.status}
                  onRetry={() => void sync.sync()}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label="シェア"
                  disabled={!ed.record}
                  onClick={async () => {
                    if (!ed.record) return;
                    await commit();
                    await shareResult(
                      buildShareText(ed.record),
                      settings.shareImage === "photo" ? draft.image : null,
                    );
                  }}
                >
                  <Share2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label="曲を変更"
                  aria-pressed={editing}
                  onClick={() => setEditing((v) => !v)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label="閉じる"
                  onClick={() => void closeAndSave()}
                >
                  <X />
                </Button>
              </div>
              <DrawerDescription className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {ed.chart ? (
                  <>
                    <DifficultyBadge
                      playStyle={ed.chart.playStyle}
                      difficulty={ed.chart.difficulty}
                      level={ed.chart.level}
                    />
                    {diff !== null && (
                      <Badge
                        variant={
                          diff > 0
                            ? "success"
                            : diff < 0
                              ? "destructive"
                              : "default"
                        }
                      >
                        自己歴代{bestVersion} {diffText}
                      </Badge>
                    )}
                  </>
                ) : (
                  "読み取れなかった項目は手で入力できます"
                )}
              </DrawerDescription>
            </header>

            {editing && (
              <SongPicker
                songs={songs}
                candidates={candidates}
                onPick={(e) => {
                  ed.pickSong(e);
                  setEditing(false);
                }}
              />
            )}

            <div className="flex flex-col gap-2">
              {/* EXスコア | BPI | 推定順位 を 1 行に。3 列とも同じ幅・高さ・文字の大きさで、中央に揃える */}
              <div className="grid grid-cols-3 gap-3">
                <Stat label="EXスコア" htmlFor="ex">
                  {ed.showManualEx ? (
                    <Input
                      id="ex"
                      inputMode="numeric"
                      autoFocus={ed.chart !== null}
                      onFocus={(e) =>
                        e.currentTarget.scrollIntoView({ block: "center" })
                      }
                      value={ed.exText}
                      onChange={(e) =>
                        ed.setExText(e.target.value.replace(/\D/g, ""))
                      }
                      className="h-10 text-center text-2xl font-semibold tabular-nums"
                    />
                  ) : (
                    <>
                      <span>{ed.exText}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(iconButton, "absolute right-0")}
                        aria-label="EXスコアを修正"
                        onClick={ed.startManualEx}
                      >
                        <Pencil />
                      </Button>
                    </>
                  )}
                </Stat>
                {/* スコアを直したら、BPI と順位は再計算が済むまでスケルトンにする */}
                <Stat label="BPI" muted={!ed.bpiLoading && !bpiIsNumber}>
                  {ed.bpiLoading ? <Skeleton className="h-7 w-20" /> : bpiText}
                </Stat>
                <Stat
                  label="推定順位"
                  muted={!ed.bpiLoading && rankText === "—"}
                >
                  {ed.bpiLoading ? <Skeleton className="h-7 w-16" /> : rankText}
                </Stat>
              </div>
              {!ed.bpiLoading &&
                (ed.record?.bpiStatus === "pending" ||
                  ed.record?.bpiStatus === "error") && (
                  <p
                    className={cn(
                      "text-xs",
                      ed.record.bpiStatus === "error"
                        ? "text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    {ed.record.bpiStatus === "error"
                      ? "BPI を算出できませんでした。曲と譜面を確認してください"
                      : "BPI は通信できたときに計算します"}
                  </p>
                )}
              {ed.chart && ed.exText !== "" && !ed.valid && (
                <p className="text-sm text-destructive">
                  0〜{ed.chart.notes * 2} の範囲で入力してください
                </p>
              )}
              <ResultDetails
                useOption={ed.useOption}
                onUseOption={ed.setUseOption}
                counts={ed.counts}
                onCount={ed.setCount}
              />
            </div>
          </div>

          {ed.record && (
            <SongTabs
              record={ed.record}
              outcome={ed.outcome}
              self={self}
              history={history}
              best={best}
              arenaRank={profile?.arenaRank ?? null}
            />
          )}
        </div>
        <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-2 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="secondary"
            className="px-2"
            disabled={saved}
            onClick={async () => {
              if (await saveImage(draft.image, imageName)) setSaved(true);
            }}
          >
            {saved ? <Check /> : <Download />}{" "}
            {saved ? "画像保存済み" : "画像保存"}
          </Button>
          {/* BPIM2 への保存は常に手動。サインインしていないと押せない。右の矢印で、保存先（最新バージョン / INFINITAS）を見て選べる */}
          <div className="relative flex">
            <Button
              variant="secondary"
              className="min-w-0 flex-1 gap-1.5 rounded-r-none px-2"
              title={
                user
                  ? `保存先: ${syncTargetLabel(syncTarget)}`
                  : "BPIM2 にサインインすると使えます"
              }
              disabled={
                !sync.canSync ||
                sync.status.kind === "syncing" ||
                sync.status.kind === "saved" ||
                sync.status.kind === "not-improved"
              }
              onClick={async () => {
                const result = await sync.sync();
                // BPIM2 は自己ベストの更新だけを保存する。更新していなかったときは、保存されなかった理由を知らせる
                if (result?.kind === "not-improved")
                  toast("自己ベスト未更新", {
                    description: `BPIM2 に保存済みの${syncTargetLabel(syncTarget)}の記録を上回っていないため、保存されませんでした`,
                  });
              }}
            >
              {sync.status.kind === "syncing" ? (
                <Loader2 className="animate-spin" />
              ) : sync.status.kind === "saved" ? (
                <Check />
              ) : (
                <RefreshCw />
              )}
              <span className="truncate">
                {sync.status.kind === "syncing"
                  ? "同期中"
                  : sync.status.kind === "saved"
                    ? "同期済み"
                    : "BPIM2同期"}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="w-9 shrink-0 rounded-l-none border-l border-border"
              aria-label={`同期先を選ぶ（いまは${syncTargetLabel(syncTarget)}）`}
              aria-haspopup="menu"
              aria-expanded={targetMenuOpen}
              disabled={sync.status.kind === "syncing"}
              onClick={() => setTargetMenuOpen((v) => !v)}
            >
              <ChevronUp
                className={cn(
                  "transition-transform",
                  targetMenuOpen && "rotate-180",
                )}
              />
            </Button>
            {targetMenuOpen && (
              <SyncTargetMenu
                value={syncTarget}
                onChange={setSyncTarget}
                onClose={() => setTargetMenuOpen(false)}
              />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** ラベルと値を縦に並べた 1 項目。値は同じ高さ・同じ大きさで中央に置く（muted は値がないときの淡い表示） */
function Stat({
  label,
  htmlFor,
  muted,
  children,
}: {
  label: string;
  htmlFor?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-normal text-muted-foreground"
      >
        {label}
      </Label>
      <div
        className={cn(
          "relative flex h-10 w-full items-center justify-center text-2xl leading-none font-semibold tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
