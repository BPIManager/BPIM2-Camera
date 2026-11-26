import type { OcrLine } from "@/lib/recognition/paddle/engine";

/**
 * 自動撮影の判定。映像が静止していて、3 つの枠にそれぞれ「それらしい文字」が出ていれば、リザルト画面が枠に合っているとみなす。
 * 文字の中身は見ない（本読みの仕事）。tiny の OCR で、文字が出ているかだけを見る。
 */

/**
 * 動かしているとみなす、2 フレーム間の平均絶対差（0〜255）の上限。
 * 小さく（幅 32px に）縮めたフレームで比べるので、手持ちの揺れや画面のちらつきでは超えない。
 * 大きく動かしている間の OCR を省くだけの、ゆるい足切り（文字が出ているかは OCR 自身が見る）。実機で調整する値
 */
export const STILL_MAX_DIFF = 16;
/** 下見に使う、縮めたフレームの横幅（px）。小さいほど、手ブレに強い */
export const STILL_FRAME_WIDTH = 32;
/** 判定を満たす回が、続けて何回あれば撮影するか */
export const REQUIRED_STREAK = 2;
/** 下見の間隔（ms）。前の下見が終わってから、この間をあけて次へ */
export const POLL_INTERVAL_MS = 350;

/** 文字として採る行の最低の確度（0〜100） */
const MIN_CONFIDENCE = 40;

export interface RegionReads {
  score: readonly OcrLine[];
  title: readonly OcrLine[];
  judge: readonly OcrLine[];
}

const textOf = (lines: readonly OcrLine[]) => lines.filter((l) => l.confidence >= MIN_CONFIDENCE).map((l) => l.text);
const digitsIn = (texts: readonly string[]) => texts.join("").replace(/\D/g, "");

/** 難易度の語。tiny の読み間違い（O と 0、I と 1 など）を見込んで、前後の一部だけで見る */
const DIFFICULTY = /BEGIN|NORMAL|HYPER|ANOTH|LEGGEN|DARIA/i;

/** 判定の表の項目名。O と 0 などの読み間違いを見込む */
const JUDGE_LABELS = [/GRE|CRE|REAT/i, /G[O0C]{1,2}D|[O0]{2}D/i, /BAD/i, /P[O0]OR|ROOR/i];

export interface Plausibility {
  score: boolean;
  title: boolean;
  judge: boolean;
  /** 3 つとも、それらしい */
  all: boolean;
}

/**
 * 各枠に、それらしい文字があるか。
 * - スコア枠: 数字が 3 桁以上（EX スコアは 3〜4 桁）
 * - 曲名枠: 難易度の語がある。または、2 行以上で、ある程度の文字数がある（曲名＋譜面の表記）
 * - 判定枠: 数字の塊が 4 つ以上、数字が 5 桁分以上、または項目名（GREAT・GOOD・BAD・POOR）が 2 種類以上
 */
export function screenPlausible(reads: RegionReads): Plausibility {
  const score = digitsIn(textOf(reads.score)).length >= 3;

  const titleTexts = textOf(reads.title);
  const title = titleTexts.some((t) => DIFFICULTY.test(t)) || (titleTexts.length >= 2 && titleTexts.join("").length >= 8);

  const judgeTexts = textOf(reads.judge);
  const numberGroups = judgeTexts.join(" ").match(/\d+/g)?.length ?? 0;
  // 小さい数字は tiny では読み間違えやすい。項目名（GREAT・GOOD・BAD・POOR）は読めるので、2 種類以上読めても、判定の表とみなす
  const labelKinds = JUDGE_LABELS.filter((re) => judgeTexts.some((t) => re.test(t))).length;
  const judge = numberGroups >= 4 || digitsIn(judgeTexts).length >= 5 || labelKinds >= 2;

  return { score, title, judge, all: score && title && judge };
}

export interface GateResult {
  /** いま、枠に画面が合っていて（静止して）、撮影を待っているところ */
  detected: boolean;
  /** 撮影してよい */
  trigger: boolean;
}

/**
 * 自動撮影をいつ始めるか。静止していて、枠に画面が合っている状態が続いたら 1 回だけ撮影する。
 * 撮影したあと、同じ画面を映し続けても、また撮影しない。カメラが動くか、画面が外れたら、また待ち受ける。
 */
export class AutoCaptureGate {
  private streak = 0;
  private armed = true;

  constructor(private readonly required = REQUIRED_STREAK) {}

  /**
   * @param still 映像が静止しているか
   * @param plausible 枠に画面が合っているか。下見をしなかった（静止していない）ときは null
   */
  update(still: boolean, plausible: boolean | null): GateResult {
    if (!still) {
      this.streak = 0;
      this.armed = true;
      return { detected: false, trigger: false };
    }
    if (plausible === null) return { detected: this.streak > 0, trigger: false };
    if (!plausible) {
      this.streak = 0;
      this.armed = true;
      return { detected: false, trigger: false };
    }
    if (!this.armed) return { detected: true, trigger: false };
    this.streak += 1;
    if (this.streak >= this.required) {
      this.streak = 0;
      this.armed = false;
      return { detected: true, trigger: true };
    }
    return { detected: true, trigger: false };
  }

  reset() {
    this.streak = 0;
    this.armed = true;
  }
}
