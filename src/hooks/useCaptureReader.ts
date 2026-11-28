import { useRef, useState } from "react";
import type { Draft } from "@/features/result/draft";
import { isAbortError, raceAbort } from "@/lib/async/abort";
import { logDebug, saveCaptures } from "@/lib/debug/ocrLog";
import type { OcrTrace, Recognizer, SongProgress } from "@/lib/recognition/recognizer";
import { resolveResult } from "@/lib/recognition/resolve";
import type { SongMasterEntry } from "@/lib/songs/types";
import type { Settings } from "@/lib/storage/settings";
import { collectReadSample } from "@/lib/training/collect";
import { flushIfEnabled } from "@/lib/training/upload";
import type { OcrEngine } from "@/lib/recognition/paddle/engine";
import { cropPixels, readUseOption } from "@/lib/recognition/useOption";
import type { Rect } from "@/lib/vision/framing";
import type { GuideKey } from "@/lib/vision/guides";
import { panelRegions, type PanelRegion } from "@/lib/vision/panelRegions";

/** パネルの中のほかの欄を、JPEG に切り出す（学習サンプル用） */
async function cropBlob(image: ImageBitmap, r: Rect): Promise<Blob> {
  const c = new OffscreenCanvas(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
  c.getContext("2d")!.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

export type CaptureSource = Draft["source"];

/**
 * 撮影・取り込んだ画像を読み取り、結果（Draft）を作る。読み取り中の段階と曲の確定状況を画面に出せるよう持ち、中止もできる。
 * 読み終わったら（成功・失敗を問わず）学習サンプルとして貯めて送る。
 */
export function useCaptureReader({
  getRecognizer,
  getEngine,
  songs,
  settings,
}: {
  getRecognizer: () => Recognizer;
  /** 使用オプションを読む OCR。準備ができていなければ null */
  getEngine: () => OcrEngine | null;
  songs: readonly SongMasterEntry[];
  settings: Settings;
}) {
  const [busy, setBusy] = useState(false);
  /** 読み取り中の段階。画面に出す */
  const [stage, setStage] = useState<string | null>(null);
  /** 読み取りの途中でわかった、曲の確定状況。画面に出す */
  const [song, setSong] = useState<SongProgress | null>(null);
  /** 読み取った結果。結果の画面を開いている間だけ入っている */
  const [draft, setDraft] = useState<Draft | null>(null);
  // 読み取りを中止したとき、画像だけ保存するかを確かめる（自動保存がオンのときだけ）。保存は、この確認の操作のあとに行う（iOS は操作の直後でないと共有シートを開けない）
  const [unsaved, setUnsaved] = useState<Blob | null>(null);
  /** 読み取りの中止用。読み取り中だけ入っている */
  const abortRef = useRef<AbortController | null>(null);

  const read = async (image: Blob, source: CaptureSource, regions?: Record<GuideKey, Blob>, frames?: Record<GuideKey, Rect>) => {
    setBusy(true);
    setStage("画像を準備しています");
    setSong(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
    let raw = null;
    let ocr: OcrTrace | undefined;
    let extraCrops: Partial<Record<PanelRegion, Blob>> | undefined;
    let optionPixels: ImageData | null = null;
    try {
      const full = await createImageBitmap(image);
      // パネルの中のほかの欄（使用オプション・ミスカウント）。枠の位置から求め、画像を閉じる前に切り出しておく。
      // FAST/SLOW は、切り出さず全体の写真で集める（学習サンプルを貯めるときに作る）
      if (frames) {
        const at = panelRegions(frames, full);
        extraCrops = {};
        for (const k of ["useOption", "missCount"] as const satisfies readonly PanelRegion[]) {
          const r = at[k];
          if (r) extraCrops[k] = await cropBlob(full, r);
        }
        if (at.useOption) optionPixels = cropPixels(full, at.useOption, 700);
      }
      const crops = regions
        ? ({
            score: await createImageBitmap(regions.score),
            title: await createImageBitmap(regions.title),
            judge: await createImageBitmap(regions.judge),
          } satisfies Record<GuideKey, ImageBitmap>)
        : undefined;
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      saveCaptures(stamp, { full: image, ...(regions ?? {}) });
      logDebug(`撮影（保存: internal/captures/${stamp}_*）: ${source} / 枠で切り出し: ${crops ? "あり" : "なし"} / 分離ページ: ${self.crossOriginIsolated}`);
      // 画像は、読み取りが（中止後に遅れて）終わるまで閉じない
      // 認識器の準備ができていない（処理の切り替え直後など）ときも、読み取りの失敗として扱う
      const task = Promise.resolve()
        .then(() => getRecognizer().recognize({ full, regions: crops, onStage: setStage, onSong: setSong, onTrace: (t) => (ocr = t), signal: controller.signal }))
        .finally(() => {
          full.close();
          if (crops) for (const b of Object.values(crops)) b.close();
        });
      raw = await raceAbort(task, controller.signal).catch((e: unknown) => {
        if (isAbortError(e)) {
          cancelled = true;
          logDebug("読み取りを中止");
          return null;
        }
        logDebug("読み取りに失敗: " + (e instanceof Error ? (e.stack ?? e.message) : String(e)));
        return null;
      });
      if (!raw && !cancelled) logDebug("読み取り結果なし（何も読めなかった）");
    } finally {
      setBusy(false);
      setStage(null);
      setSong(null);
      abortRef.current = null;
    }
    // 中止したときは、結果の画面を出さず、撮影に戻る
    if (cancelled) {
      if (settings.saveToCameraRoll && source === "camera") setUnsaved(image);
      return;
    }
    const next: Draft = {
      id: crypto.randomUUID(),
      image,
      source,
      regions,
      extraCrops,
      ocr,
      raw,
      resolution: raw ? resolveResult(raw, songs) : null,
    };
    setDraft(next);
    // 使用オプションは、結果を出したあとで読む（読み取りの待ち時間を増やさない）。読めたら結果に足す
    const engine = getEngine();
    if (optionPixels && engine && raw) {
      void readUseOption(optionPixels, engine)
        .then((useOption) => {
          if (useOption) setDraft((d) => (d && d.id === next.id && d.raw ? { ...d, raw: { ...d.raw, useOption } } : d));
        })
        .catch(() => undefined);
    }
    // 確定を待たず、読み取りが終わった時点で学習サンプルとして貯めて送る（成功・失敗を問わない）
    void collectReadSample(next, settings)
      .then((saved) => (saved ? flushIfEnabled(settings) : null))
      .catch(() => undefined);
  };

  return {
    busy,
    stage,
    song,
    draft,
    closeDraft: () => setDraft(null),
    unsaved,
    clearUnsaved: () => setUnsaved(null),
    read,
    cancel: () => abortRef.current?.abort(),
  };
}
