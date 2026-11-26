import { useEffect, useRef, useState } from "react";
import type { CurvePoint } from "@/lib/bpi/client";
import { chartRankBorders, djRankPair } from "@/lib/domain/djRank";

/** 棒グラフに重ねる横線（アリーナ平均・ライバル・自己ベストのどれか 1 本） */
export interface RefLine {
  label: string;
  score: number;
}

interface Props {
  curve: readonly CurvePoint[];
  /** 今回の EX スコア */
  exScore: number;
  /** 満点（ノーツ数 × 2） */
  maxScore: number;
  refLine?: RefLine | null;
}

interface Bar {
  label: string;
  score: number;
  you: boolean;
}

/** 測る前の大きさ（サーバー側の描画や、最初の 1 フレーム用） */
const FALLBACK = { w: 340, h: 196 };
const PAD_X = 8;
const TOP = 26;
const BOTTOM = 18;
/** YOU の吹き出し（2 行）の大きさ */
const NOTE_W = 66;
const NOTE_H = 28;

/**
 * BPI 100〜0 に必要なスコアを棒で並べ、今回のスコア（YOU）と、選んだ参照線を重ねる。
 * 置かれた領域の大きさを測り、その大きさいっぱいに描く（縦に長い領域でも、下が空かない）。
 */
export default function BpiChart({ curve, exScore, maxScore, refLine }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const { w: W, h: H } = size;

  const zero = curve.find((c) => c.bpi === 0)?.score ?? 0;
  const yMin = Math.max(0, Math.floor(zero - maxScore * 0.08));
  // 満点まで取らず、いちばん高い棒（や参照線）の少し上までにする。上の余白を作らない
  const top = Math.max(exScore, ...curve.map((c) => c.score), refLine?.score ?? 0);
  const yMax = Math.min(maxScore, Math.ceil(top + maxScore * 0.01));
  const plotH = H - TOP - BOTTOM;
  const yOf = (score: number) => TOP + plotH * (1 - (Math.min(Math.max(score, yMin), yMax) - yMin) / (yMax - yMin || 1));

  const bars: Bar[] = [
    ...curve.map((c) => ({ label: String(c.bpi), score: c.score, you: false })),
    { label: "YOU", score: exScore, you: true },
  ].sort((a, b) => b.score - a.score || Number(b.you) - Number(a.you));
  const slot = (W - PAD_X * 2) / bars.length;
  const barW = slot * 0.64;
  // DJ ランクの境界（A・AA・AAA・MAX-）。描く範囲の外のものは描かない（BPIM2 の曲詳細と同じ）
  const borders = chartRankBorders(maxScore)
    .filter((b) => b.score > yMin && b.score <= yMax)
    .map((b) => ({ ...b, y: yOf(b.score) }));
  // YOU の棒から線を引いて、「いまのランク / 次のランク」（例: AAA+12 / MAX-34）を、空いている右側に出しっぱなしにする。
  // 棒は左から右へ低くなるので、YOU の右側の上は空いている。右に置く余地がない（YOU が右端に近い）ときは、右上に置く
  const you = bars.findIndex((b) => b.you);
  const youLeft = PAD_X + slot * you + (slot - barW) / 2;
  const youCx = youLeft + barW / 2;
  const youY = yOf(exScore);
  const rank = djRankPair(exScore, maxScore);
  const noteX = W - PAD_X - NOTE_W;
  const roomRight = noteX - (youLeft + barW) >= 10;
  const noteY = roomRight ? Math.min(Math.max(youY - NOTE_H / 2, 2), Math.max(2, H - BOTTOM - NOTE_H)) : 2;
  const noteMidY = noteY + NOTE_H / 2;
  const leader = roomRight
    ? `M${youLeft + barW} ${youY} L${noteX} ${Math.min(Math.max(youY, noteY + 3), noteY + NOTE_H - 3)}`
    : youCx >= noteX
      ? `M${youCx} ${youY - 15} V${noteY + NOTE_H}`
      : `M${youCx} ${youY - 15} V${noteMidY} H${noteX}`;
  // 範囲外の線は描かない
  const ref = refLine && refLine.score > yMin && refLine.score <= yMax ? { ...refLine, y: yOf(refLine.score) } : null;

  return (
    // 中身の大きさが、測る対象の大きさに影響しないよう、はみ出しは隠す
    <div ref={boxRef} className="size-full overflow-hidden">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="BPI 100 から 0 に必要なスコアと、今回のスコアの比較">
        {bars.map((b, i) => {
          const x = PAD_X + slot * i + (slot - barW) / 2;
          const y = yOf(b.score);
          const diff = b.score - exScore;
          return (
            <g key={b.label}>
              <rect x={x} y={y} width={barW} height={Math.max(2, TOP + plotH - y)} rx={2} className={b.you ? "fill-warning" : "fill-primary/45"} />
              <text x={x + barW / 2} y={y - (b.you ? 4 : 14)} textAnchor="middle" className={b.you ? "fill-warning" : "fill-foreground"} fontSize={9} fontWeight={600}>
                {b.score}
              </text>
              {!b.you && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" className={diff > 0 ? "fill-destructive" : "fill-success"} fontSize={8}>
                  {diff > 0 ? `+${diff}` : diff}
                </text>
              )}
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" className={b.you ? "fill-warning" : "fill-muted-foreground"} fontSize={10} fontWeight={b.you ? 700 : 500}>
                {b.label}
              </text>
            </g>
          );
        })}
        {borders.map((b) => (
          <g key={b.label} className="stroke-warning/35 fill-warning/80" aria-hidden>
            <line x1={PAD_X} x2={W - PAD_X} y1={b.y} y2={b.y} strokeWidth={1} strokeDasharray="4 4" fill="none" />
            <text x={W - PAD_X} y={b.y - 3} textAnchor="end" fontSize={9} fontWeight={700} stroke="none">
              {b.label}
            </text>
          </g>
        ))}
        {ref && (
          <g className="stroke-success fill-success">
            <line x1={PAD_X} x2={W - PAD_X} y1={ref.y} y2={ref.y} strokeWidth={1} strokeDasharray="4 3" fill="none" />
            <text x={PAD_X + 2} y={ref.y - 3} fontSize={9} fontWeight={600} stroke="none">
              {ref.label} {ref.score}
            </text>
          </g>
        )}
        {/* YOU の吹き出し（閉じない）。棒から線でつなぐ */}
        <g aria-label={`${rank.current} / ${rank.next}`}>
          <path d={leader} className="stroke-warning/70" strokeWidth={1} strokeDasharray="3 3" fill="none" />
          <rect x={noteX} y={noteY} width={NOTE_W} height={NOTE_H} rx={6} className="fill-card stroke-warning/60" strokeWidth={1} />
          <text x={noteX + NOTE_W / 2} y={noteY + 12} textAnchor="middle" className="fill-warning" fontSize={10} fontWeight={700}>
            {rank.current}
          </text>
          <text x={noteX + NOTE_W / 2} y={noteY + 23} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
            {rank.next}
          </text>
        </g>
      </svg>
    </div>
  );
}
