import { useState } from "react";
import { Download, Pencil, Share2 } from "lucide-react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import Input from "@/components/ui/input";
import Label from "@/components/ui/label";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { saveResult } from "@/lib/storage/history";
import { saveSample } from "@/lib/storage/samples";
import { saveImage } from "@/lib/share/save";
import { shareResult } from "@/lib/share/share";
import { buildShareText } from "@/lib/share/text";
import type { SongMasterEntry } from "@/lib/songs/types";
import type { Settings } from "@/lib/storage/settings";
import BpiLine from "./BpiLine";
import type { Draft } from "./draft";
import SongPicker from "./SongPicker";
import { useResultEditor } from "./useResultEditor";

interface Props {
  draft: Draft;
  songs: readonly SongMasterEntry[];
  settings: Settings;
  onClose: () => void;
}

const API_VERSION = "33";

export default function ResultDrawer({ draft, songs, settings, onClose }: Props) {
  const ed = useResultEditor(draft, API_VERSION);
  useKeyboardInset();
  const [editing, setEditing] = useState(ed.chart === null);
  const candidates = (draft.resolution?.candidates ?? []).map((c) => c.entry);

  const commit = async () => {
    if (!ed.record) return;
    await saveResult(ed.record, draft.image);
    // 統計への同意があるときだけ、確認済みの値を正解ラベルとして学習サンプルを貯める
    if (settings.statsConsent === true && draft.regions) {
      await saveSample({
        id: ed.record.id,
        createdAt: ed.record.createdAt,
        playSide: settings.playSide,
        chart: ed.record.chart,
        exScore: ed.record.exScore,
        autoConfirmed: ed.record.correctedFields.length === 0 && draft.resolution?.autoConfirm === true,
        correctedFields: ed.record.correctedFields,
        scoreCrop: draft.regions.score,
        titleCrop: draft.regions.title,
        judgeCrop: draft.regions.judge,
      });
    }
    if (settings.saveToCameraRoll && draft.source === "camera") {
      await saveImage(draft.image, `iidx-${ed.record.createdAt}.jpg`);
    }
  };
  const closeAndSave = async () => {
    await commit();
    onClose();
  };

  return (
    <Drawer open onOpenChange={(o) => !o && void closeAndSave()}>
      <DrawerContent>
        <div data-vaul-no-drag className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <header className="flex flex-col gap-1">
            <DrawerTitle className="text-lg font-semibold">{ed.chart?.title ?? "曲を選んでください"}</DrawerTitle>
            <DrawerDescription className="flex items-center gap-2 text-sm text-muted-foreground">
              {ed.chart ? (
                <>
                  <Badge variant="outline">
                    {ed.chart.playStyle} {ed.chart.difficulty} ☆{ed.chart.level}
                  </Badge>
                  <span>{ed.chart.notes} notes</span>
                </>
              ) : (
                "読み取れなかった項目は手で入力できます"
              )}
            </DrawerDescription>
          </header>

          {editing && <SongPicker songs={songs} candidates={candidates} onPick={(e) => { ed.pickSong(e); setEditing(false); }} />}

          <div className="flex flex-col gap-2">
            <Label htmlFor="ex">EXスコア</Label>
            {ed.showManualEx ? (
              <Input id="ex" inputMode="numeric" autoFocus={ed.chart !== null} onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })} value={ed.exText} onChange={(e) => ed.setExText(e.target.value.replace(/\D/g, ""))} />
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums">{ed.exText}</p>
                <Button variant="ghost" size="sm" onClick={ed.startManualEx}>
                  修正
                </Button>
              </div>
            )}
            {ed.chart && ed.exText !== "" && !ed.valid && (
              <p className="text-sm text-destructive">0〜{ed.chart.notes * 2} の範囲で入力してください</p>
            )}
          </div>

          {ed.record && (
            <div className="flex flex-col gap-3">
              <BpiLine record={ed.record} />
              {ed.record.judge && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  PG {ed.record.judge.pgreat} / GR {ed.record.judge.great} / GD {ed.record.judge.good} / BD {ed.record.judge.bad} / PR {ed.record.judge.poor}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
            <Pencil /> 修正
          </Button>
          <Button
            variant="secondary"
            disabled={!ed.record}
            onClick={() => ed.record && void saveImage(draft.image, `iidx-${ed.record.createdAt}.jpg`)}
          >
            <Download /> 保存
          </Button>
          <Button
            disabled={!ed.record}
            onClick={async () => {
              if (!ed.record) return;
              await commit();
              await shareResult(buildShareText(ed.record), settings.shareImage === "photo" ? draft.image : null);
            }}
          >
            <Share2 /> シェア
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
