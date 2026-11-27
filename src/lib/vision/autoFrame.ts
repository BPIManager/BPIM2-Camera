import { editDistance } from "@/lib/songs/normalize";
import type { GuideKey, GuideLayout, NormRect } from "./guides";

/**
 * 取り込んだ画像（リザルト画面の写真・スクリーンショット）に、撮影枠（スコア・曲名・判定）を自動で置く。
 * 画像全体を 1 回 OCR して、位置の決まった文字（判定の見出し・「SCORE」・難易度・「NOTES」など）を探し、
 * 基準の写真での位置と重なるよう、拡大・回転・移動（相似変換）を当てはめる。基準の写真での枠を、同じ変換で移して置く。
 */

/** OCR の 1 行（位置は画素） */
export interface ScanLine {
  text: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
}

export type AnchorKind =
  | "best"
  | "current"
  | "clearType"
  | "djLevel"
  | "scoreLabel"
  | "missCount"
  | "great1"
  | "great2"
  | "good"
  | "bad"
  | "poor"
  | "difficulty"
  | "notes"
  | "songTitle";

export interface Anchor {
  kind: AnchorKind;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * 見出しの文字の決まりと、どの端を位置に使うか。
 * 左の欄の項目名（CLEAR TYPE・DJ LEVEL・SCORE・MISS COUNT）は、写真の端で左が切れやすいので、右端を使い、末尾だけ読めていればよい。
 * 判定の見出しは、右の数字とつながって読まれることがあるので左端。「NOTES」は右寄せなので右端
 */
const PATTERNS: { kind: Exclude<AnchorKind, "great1" | "great2"> | "great"; re: RegExp; edge: "left" | "right" }[] = [
  { kind: "best", re: /ベスト/, edge: "left" },
  { kind: "current", re: /[今回].{0,2}スコ/, edge: "left" },
  { kind: "clearType", re: /^(C?L?E?A?R?)TYPE$/, edge: "right" },
  { kind: "djLevel", re: /^(DJ)?L?E?VEL$/, edge: "right" },
  { kind: "scoreLabel", re: /^(EX)?S?CORE$/, edge: "right" },
  { kind: "missCount", re: /^(M?I?S?S)?COUNT$/, edge: "right" },
  { kind: "great", re: /^P?GREAT/, edge: "left" },
  { kind: "good", re: /^GOOD/, edge: "left" },
  { kind: "bad", re: /^BAD/, edge: "left" },
  { kind: "poor", re: /^POOR/, edge: "left" },
  { kind: "difficulty", re: /^(ANOTHER|HYPER|NORMAL|LEGGENDARIA|BEGINNER)/, edge: "left" },
  { kind: "notes", re: /NOTES$/, edge: "right" },
];

/** 読みの確度がこれ未満の行は、手がかりにしない */
const MIN_CONFIDENCE = 50;
/** 曲名の行とみなす、曲データとの一致度 */
const TITLE_MATCH = 0.8;
/** リザルト画面の表記。同じ名前の曲（「SCORE」など）があるので、曲名の候補から外す */
const UI_WORDS = ["SCORE", "LEVEL", "DJLEVEL", "CLEAR", "CLEARTYPE", "RANDOM", "MIRROR", "OPTION", "USEOPTION", "COUNT", "MISSCOUNT", "NOTES", "JUDGE", "GREAT", "GOOD", "POOR", "FAST", "SLOW", "NEXT", "STAGE", "RESULT", "TYPE", "TIMING", "STATUS", "COMBO", "BREAK", "TIMELIMIT"];
/** 表記のどれか（1 文字の読み違いまで）に見える行か */
function looksLikeUi(text: string): boolean {
  const t = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (t.length === 0) return true;
  return UI_WORDS.some((w) => t === w || (t.length >= 4 && Math.abs(t.length - w.length) <= 1 && editDistance(t, w) <= 1));
}

/**
 * OCR の行から、位置の手がかりになる文字を探す。画像の端で切れている（端に接している）ものは、位置がずれるので使わない。
 * titleScore があれば、曲データの曲名に最もよく一致する行も、曲名の位置（右寄せなので右端）として使う。
 * 難易度・ノーツ数の行は小さく、斜めの写真では読めないことが多いが、曲名は大きいので読めやすい
 */
export function findAnchors(lines: readonly ScanLine[], size: { width: number; height: number }, titleScore?: (text: string) => number): Anchor[] {
  const found = new Map<string, Anchor[]>();
  const margin = size.width * 0.005;
  for (const l of lines) {
    if (l.confidence < MIN_CONFIDENCE) continue;
    const text = l.text.toUpperCase().replace(/\s+/g, "");
    const p = PATTERNS.find((q) => q.re.test(text));
    if (!p) continue;
    const { x, y, width, height } = l.box;
    // 位置に使う端が、画像の端で切れていれば使わない
    if (p.edge === "left" ? x <= margin : x + width >= size.width - margin) continue;
    const a = { kind: p.kind as AnchorKind, x: p.edge === "left" ? x : x + width, y: y + height / 2 };
    found.set(p.kind, [...(found.get(p.kind) ?? []), a]);
  }
  const out: Anchor[] = [];
  if (titleScore) {
    let best: { line: ScanLine; score: number } | null = null;
    for (const l of lines) {
      if (l.confidence < MIN_CONFIDENCE || l.text.trim().length < 3 || l.box.x + l.box.width >= size.width - margin) continue;
      const upper = l.text.toUpperCase().replace(/\s+/g, "");
      if (looksLikeUi(l.text) || PATTERNS.some((p) => p.re.test(upper))) continue;
      const score = titleScore(l.text.trim());
      if (score >= TITLE_MATCH && (!best || score > best.score)) best = { line: l, score };
    }
    if (best) out.push({ kind: "songTitle", x: best.line.box.x + best.line.box.width, y: best.line.box.y + best.line.box.height / 2 });
  }
  for (const [kind, list] of found) {
    if (kind === "great") {
      // GREAT は 2 行（PGREAT・GREAT）。上から順に PG・GR とする。3 行以上あれば、どれか分からないので使わない
      if (list.length > 2) continue;
      const sorted = [...list].sort((a, b) => a.y - b.y);
      if (sorted.length === 2) out.push({ ...sorted[0]!, kind: "great1" }, { ...sorted[1]!, kind: "great2" });
      continue;
    }
    // 同じ見出しが複数あれば、どれか分からないので使わない
    if (list.length === 1) out.push(list[0]!);
  }
  return out;
}

/** 相似変換（拡大 s・回転 θ・移動 t）。q = s R(θ) p + t */
export interface Similarity {
  s: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
}

export const apply = (m: Similarity, p: Point): Point => ({ x: m.s * (m.cos * p.x - m.sin * p.y) + m.tx, y: m.s * (m.sin * p.x + m.cos * p.y) + m.ty });

/** 対応する点の組から、最小二乗で相似変換を求める */
export function fitSimilarity(from: readonly Point[], to: readonly Point[]): Similarity {
  const n = from.length;
  const mean = (ps: readonly Point[]) => ({ x: ps.reduce((a, p) => a + p.x, 0) / n, y: ps.reduce((a, p) => a + p.y, 0) / n });
  const pm = mean(from);
  const qm = mean(to);
  let a = 0;
  let b = 0;
  let pp = 0;
  for (let i = 0; i < n; i++) {
    const px = from[i]!.x - pm.x;
    const py = from[i]!.y - pm.y;
    const qx = to[i]!.x - qm.x;
    const qy = to[i]!.y - qm.y;
    a += px * qx + py * qy;
    b += px * qy - py * qx;
    pp += px * px + py * py;
  }
  const norm = Math.hypot(a, b) || 1;
  const s = norm / (pp || 1);
  const cos = a / norm;
  const sin = b / norm;
  return { s, cos, sin, tx: qm.x - s * (cos * pm.x - sin * pm.y), ty: qm.y - s * (sin * pm.x + cos * pm.y) };
}

export interface CanonicalLayout {
  /** 基準の写真での、手がかりの文字の位置（画素） */
  anchors: Partial<Record<AnchorKind, Point>>;
  /** 基準の写真での、枠（画素） */
  frames: Record<GuideKey, { x: number; y: number; width: number; height: number }>;
}

export interface FrameFit {
  layout: GuideLayout;
  /** 当てはめに使った手がかりの数 */
  used: number;
  transform: Similarity;
}

/**
 * 枠ごとに近くの手がかり。全体の当てはめのあと、これらの手がかりのずれ（読んだ位置 − 当てはめた位置）の分だけ、枠を動かす。
 * モニターを斜めから撮ると、写真は相似変換では表しきれない（遠近でゆがむ）ので、枠の近くで合わせ直す
 */
const NEAR: Record<GuideKey, readonly AnchorKind[]> = {
  score: ["scoreLabel", "missCount", "djLevel", "current", "best"],
  judge: ["great1", "great2", "good", "bad", "poor"],
  title: ["difficulty", "notes", "songTitle"],
};

/** 当てはめに要る手がかりの数 */
export const MIN_ANCHORS = 3;
/** 回転は、これ以上は当てはめの失敗とみなす（度） */
const MAX_ROTATION = 25;

/**
 * 手がかりから枠を置く。外れた手がかり（読み違い）は、当てはまりの悪いものから外していく。
 * 3 つ以上の手がかりで当てはまらなければ null（保存済みの枠などを使う）
 */
export function fitFrames(anchors: readonly Anchor[], canon: CanonicalLayout, size: { width: number; height: number }, minAnchors = MIN_ANCHORS): FrameFit | null {
  let pairs = anchors.filter((a) => canon.anchors[a.kind]).map((a) => ({ from: canon.anchors[a.kind]!, to: { x: a.x, y: a.y } }));
  const tolerance = Math.hypot(size.width, size.height) * 0.02;
  let m: Similarity | null = null;
  while (pairs.length >= minAnchors) {
    m = fitSimilarity(
      pairs.map((p) => p.from),
      pairs.map((p) => p.to),
    );
    const residuals = pairs.map((p) => {
      const q = apply(m!, p.from);
      return Math.hypot(q.x - p.to.x, q.y - p.to.y);
    });
    const worst = residuals.indexOf(Math.max(...residuals));
    if (residuals[worst]! <= tolerance) break;
    pairs = pairs.filter((_, i) => i !== worst);
    m = null;
  }
  if (!m || pairs.length < minAnchors) return null;
  if ((Math.abs(Math.atan2(m.sin, m.cos)) * 180) / Math.PI > MAX_ROTATION) return null;
  const fitted = m;
  // 枠ごとの、近くの手がかりのずれ（中央値）
  const shift = (key: GuideKey): Point => {
    const near = pairs.filter((p) => NEAR[key].some((k) => canon.anchors[k] === p.from));
    if (near.length === 0) return { x: 0, y: 0 };
    const dx = near.map((p) => p.to.x - apply(fitted, p.from).x).sort((a, b) => a - b);
    const dy = near.map((p) => p.to.y - apply(fitted, p.from).y).sort((a, b) => a - b);
    return { x: dx[Math.floor(dx.length / 2)]!, y: dy[Math.floor(dy.length / 2)]! };
  };
  const toRect = (r: { x: number; y: number; width: number; height: number }, d: Point): NormRect => {
    // 回転していれば、回した枠を囲む矩形にする
    const corners = [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height },
      { x: r.x + r.width, y: r.y + r.height },
    ].map((p) => {
      const q = apply(fitted, p);
      return { x: q.x + d.x, y: q.y + d.y };
    });
    const x0 = Math.max(0, Math.min(...corners.map((c) => c.x)));
    const y0 = Math.max(0, Math.min(...corners.map((c) => c.y)));
    const x1 = Math.min(size.width, Math.max(...corners.map((c) => c.x)));
    const y1 = Math.min(size.height, Math.max(...corners.map((c) => c.y)));
    return { x: x0 / size.width, y: y0 / size.height, width: Math.max(0, x1 - x0) / size.width, height: Math.max(0, y1 - y0) / size.height };
  };
  const layout = { score: toRect(canon.frames.score, shift("score")), title: toRect(canon.frames.title, shift("title")), judge: toRect(canon.frames.judge, shift("judge")) };
  // 枠が画像の外に出てしまう（ほとんど残らない）なら、当てはめの失敗
  if (Object.values(layout).some((r) => r.width < 0.02 || r.height < 0.01)) return null;
  return { layout, used: pairs.length, transform: m };
}
