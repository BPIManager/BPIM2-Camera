import { currentIdToken } from "@/lib/firebase/auth";
import type { ChartRef } from "@/lib/domain/types";
import { LATEST_VERSION } from "./client";
import { BPIM2_API_PROXY } from "./me";

interface Envelope<T> {
  error: boolean;
  body: T | null;
}

/** 認証つき BPIM2 API（同一オリジンの中継経由）。未サインイン・失敗は null */
export async function bpim2Get<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T | null> {
  try {
    const token = await currentIdToken();
    if (!token) return null;
    const res = await fetchImpl(`${BPIM2_API_PROXY}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const json = (await res.json()) as Envelope<T>;
    return json.error ? null : json.body;
  } catch {
    return null;
  }
}

/** BPIM2 へのスコア保存の結果 */
export type SyncResult =
  | { kind: "saved" }
  /** 自己ベストを上回っていない（BPIM2 は自己ベストの更新だけを保存する） */
  | { kind: "not-improved" }
  | { kind: "error"; message: string };

/** スコアと一緒に送る値。分からなければ null（BPIM2 は、ミスカウントが null なら最新の記録の値を引き継ぐ） */
export interface SyncExtras {
  useOption: string | null;
  missCount: number | null;
}

/**
 * 読み取ったスコアを BPIM2 に保存する（POST /users/{uid}/scores/manual）。
 * 曲の ID は Camera の曲マスタ（allSongs）のものなので songDomain は "allSongs" で渡す。☆11・☆12 の songs 側へはサーバーが曲名と難易度で対応づける。
 * 使用オプションとミスカウントも送る（古い BPIM2 は知らない項目を無視する）
 */
export async function syncScore(
  userId: string,
  chart: ChartRef,
  exScore: number,
  version: string = LATEST_VERSION,
  extras: SyncExtras = { useOption: null, missCount: null },
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  try {
    const token = await currentIdToken();
    if (!token) return { kind: "error", message: "サインインしていません" };
    const res = await fetchImpl(`${BPIM2_API_PROXY}/api/v2/users/${userId}/scores/manual`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ songId: chart.songId, songDomain: "allSongs", version, exScore, useOption: extras.useOption, missCount: extras.missCount }),
    });
    if (res.ok) return { kind: "saved" };
    const json = (await res.json().catch(() => null)) as { errorMessage?: string | null; message?: string } | null;
    const message = json?.errorMessage ?? json?.message ?? `HTTP ${res.status}`;
    return res.status === 400 && message.includes("上回って") ? { kind: "not-improved" } : { kind: "error", message };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "通信できませんでした" };
  }
}

/** 総合BPIの変動（BPIM2 のプレビュー）。before は記録した最高値、after は保存した場合 */
export interface TotalBpiChange {
  before: number | null;
  after: number | null;
  delta: number | null;
}

/** BPIM2 に保存した場合の見込み（保存しない）。totalBpi は ☆12 などの対象外では null */
export interface BpimPreview {
  /** 自己ベスト（EX・ランプ・ミスカウント）を上回るか。上回らなければ保存されず、総合BPIも変わらない */
  improved: boolean;
  totalBpi: TotalBpiChange | null;
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * 保存した場合の総合BPIの変動を取る（POST /users/{uid}/scores/manual に preview: true。保存しない）。
 * 曲・スコアを直すたびに呼ぶので、失敗は null にして画面は何も出さない
 */
export async function previewScore(
  userId: string,
  chart: ChartRef,
  exScore: number,
  version: string = LATEST_VERSION,
  extras: SyncExtras = { useOption: null, missCount: null },
  fetchImpl: typeof fetch = fetch,
): Promise<BpimPreview | null> {
  try {
    const token = await currentIdToken();
    if (!token) return null;
    const res = await fetchImpl(`${BPIM2_API_PROXY}/api/v2/users/${userId}/scores/manual`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ songId: chart.songId, songDomain: "allSongs", version, exScore, useOption: extras.useOption, missCount: extras.missCount, preview: true }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Envelope<{ improved?: unknown; totalBpi?: { before?: unknown; after?: unknown; delta?: unknown } | null }>;
    const body = json.error ? null : json.body;
    if (!body || typeof body.improved !== "boolean") return null;
    const t = body.totalBpi;
    return { improved: body.improved, totalBpi: t ? { before: numOrNull(t.before), after: numOrNull(t.after), delta: numOrNull(t.delta) } : null };
  } catch {
    return null;
  }
}

/** 自分のスコア履歴の 1 件 */
export interface HistoryEntry {
  exScore: number;
  bpi: number | null;
  lastPlayed: string | null;
  version: string | null;
}

interface RawScore {
  exScore: number | null;
  bpi: number | null;
  lastPlayed: string | null;
  version?: string | null;
}

/** 履歴 API は IIDX バージョンごとのグループで返す。新しい順の 1 本のリストにする */
export function flattenHistory(groups: Record<string, RawScore[]>): HistoryEntry[] {
  return Object.entries(groups)
    .flatMap(([version, scores]) =>
      scores.flatMap((s) =>
        s.exScore === null
          ? []
          : [{ exScore: s.exScore, bpi: s.bpi === null ? null : Number(s.bpi), lastPlayed: s.lastPlayed, version: s.version ?? version }],
      ),
    )
    .sort((a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""));
}

/**
 * 曲の ID は 2 系統ある。
 * - Camera の曲マスタの ID は allSongs（全難易度）のもの。☆10 以下のスコアは all-scores 系の API に、この ID で入っている
 * - ☆11・☆12（BPI 対象）のスコアは scores 系の API に入っていて、ID は songs テーブルのもの（allSongs とは別）
 */
export type SongRoute = { kind: "all"; songId: number } | { kind: "bpi"; songId: number };

interface SongSearchRow {
  songId: number;
  title: string;
  difficulty: string;
  difficultyLevel: number;
  notes: number;
}

/** 曲検索の結果から、読み取った譜面に当たる行を選ぶ。曲名と難易度が一致するもの。表記ゆれで曲名が合わなければ、難易度とノーツ数が一致する 1 件だけなら採る */
export function pickBpiSong(rows: readonly SongSearchRow[], chart: ChartRef): SongSearchRow | null {
  const sameDifficulty = rows.filter((r) => r.difficulty === chart.difficulty && r.difficultyLevel === chart.level);
  const exact = sameDifficulty.find((r) => r.title === chart.title);
  if (exact) return exact;
  const byNotes = sameDifficulty.filter((r) => r.notes === chart.notes);
  return byNotes.length === 1 ? byNotes[0] : null;
}

const routeCache = new Map<string, Promise<SongRoute | null>>();

/** どの API 系統で引くかを決める。☆11・☆12 は songs の ID を曲検索で引く（見つからなければ null） */
export function resolveSongRoute(chart: ChartRef, fetchImpl: typeof fetch = fetch): Promise<SongRoute | null> {
  if (chart.level < 11) return Promise.resolve({ kind: "all", songId: chart.songId });
  const key = `${chart.title}\u0000${chart.difficulty}\u0000${chart.level}\u0000${chart.notes}`;
  let hit = routeCache.get(key);
  if (!hit) {
    hit = (async () => {
      try {
        const q = new URLSearchParams({ title: chart.title, difficultyLevel: String(chart.level), version: LATEST_VERSION });
        const res = await fetchImpl(`${BPIM2_API_PROXY}/api/v2/songs/search?${q}`);
        if (!res.ok) return null;
        const json = (await res.json()) as Envelope<SongSearchRow[]>;
        const row = json.body ? pickBpiSong(json.body, chart) : null;
        return row ? ({ kind: "bpi", songId: row.songId } as const) : null;
      } catch {
        return null;
      }
    })();
    // 失敗（null）は覚えず、次回やり直せるようにする
    void hit.then((r) => r === null && routeCache.delete(key));
    routeCache.set(key, hit);
  }
  return hit;
}

/** 各 API のパス。系統（all-scores / scores）で違う */
export function songPaths(route: SongRoute, userId: string, version: string) {
  const id = route.songId;
  const u = `/api/v2/users/${userId}`;
  return route.kind === "all"
    ? {
        history: `${u}/all-scores/${id}/history`,
        rivals: `${u}/all-scores/${id}/rivals?version=${version}`,
        global: `${u}/all-scores/${id}/ranking?version=${version}`,
      }
    : {
        history: `${u}/scores/${id}/history`,
        rivals: `${u}/rivals/following/scores/${id}?version=${version}`,
        global: `${u}/ranking/song/${id}?version=${version}`,
      };
}

export async function fetchHistory(userId: string, chart: ChartRef): Promise<HistoryEntry[] | null> {
  const route = await resolveSongRoute(chart);
  if (!route) return null;
  const groups = await bpim2Get<Record<string, RawScore[]>>(songPaths(route, userId, LATEST_VERSION).history);
  return groups ? flattenHistory(groups) : null;
}

/** 過去の自己ベスト（全バージョン）と、それを出したバージョン。同点が複数あれば、最初に出した（古い）ほう。記録がなければ null */
export function personalBestEntry(history: readonly HistoryEntry[] | null): { exScore: number; version: string | null } | null {
  if (!history || history.length === 0) return null;
  const top = Math.max(...history.map((h) => h.exScore));
  const first = history.filter((h) => h.exScore === top).at(-1)!;
  return { exScore: top, version: first.version };
}

/** 過去の自己ベスト（全バージョン）。記録がなければ null */
export function personalBest(history: readonly HistoryEntry[] | null): number | null {
  return personalBestEntry(history)?.exScore ?? null;
}

/** 過去の自己ベストとの差（今回 − 過去の自己ベスト）。マイナスも返す。記録がない（初プレー）なら null */
export function personalBestDiff(exScore: number, best: number | null): number | null {
  return best === null ? null : exScore - best;
}

/** 履歴 1 件。同じバージョン内で 1 つ前（古い方）のスコアとの差を持つ */
export interface HistoryRecord extends HistoryEntry {
  scoreDiff: number | null;
}

export interface HistoryGroup {
  version: string;
  records: HistoryRecord[];
}

/** バージョン番号の大きい順（INF などの数字でないものは最後）。バージョン内は新しい順のまま */
export function groupHistoryByVersion(history: readonly HistoryEntry[]): HistoryGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const h of history) {
    const v = h.version ?? "unknown";
    map.set(v, [...(map.get(v) ?? []), h]);
  }
  const rank = (v: string) => (/^\d+$/.test(v) ? Number(v) : -1);
  return [...map.entries()]
    .sort(([a], [b]) => rank(b) - rank(a))
    .map(([version, records]) => ({
      version,
      records: records.map((r, i) => ({ ...r, scoreDiff: records[i + 1] ? r.exScore - records[i + 1].exScore : null })),
    }));
}

/** ランキングの 1 行 */
export interface RankRow {
  userId: string;
  userName: string;
  profileImage: string | null;
  exScore: number;
  bpi: number | null;
  isSelf: boolean;
  /** 同点は同順位 */
  rank: number;
}

export type RawRow = { userId: string; userName?: string | null; profileImage?: string | null; exScore: number | null; bpi?: number | null };

export interface SelfInfo {
  userId: string;
  userName: string;
  profileImage: string | null;
}

/**
 * 他のプレイヤーの行に、今回のスコアでの自分を入れて順位を付ける。
 * サーバーに保存済みの自分の行は、今回のスコアで置き換える（保存前でも、いまのスコアでの順位が見える）。
 */
export function rankWithSelf(rows: readonly RawRow[], self: SelfInfo, exScore: number, bpi: number | null): RankRow[] {
  const others = rows.filter((r) => r.userId !== self.userId && r.exScore !== null);
  const all = [
    ...others.map((r) => ({
      userId: r.userId,
      userName: r.userName ?? "",
      profileImage: r.profileImage ?? null,
      exScore: r.exScore as number,
      bpi: r.bpi ?? null,
      isSelf: false,
    })),
    { ...self, exScore, bpi, isSelf: true },
  ].sort((a, b) => b.exScore - a.exScore || Number(b.isSelf) - Number(a.isSelf));
  return all.map((r) => ({ ...r, rank: 1 + all.filter((o) => o.exScore > r.exScore).length }));
}

export interface RankingData {
  rows: RawRow[];
  /** 全体の人数（グローバルのみ） */
  totalCount?: number;
}

export async function fetchRivalRanking(userId: string, chart: ChartRef, version: string): Promise<RankingData | null> {
  const route = await resolveSongRoute(chart);
  if (!route) return null;
  const body = await bpim2Get<{ rivals?: RawRow[] }>(songPaths(route, userId, version).rivals);
  return body ? { rows: body.rivals ?? [] } : null;
}

export async function fetchGlobalRanking(userId: string, chart: ChartRef, version: string): Promise<RankingData | null> {
  const route = await resolveSongRoute(chart);
  if (!route) return null;
  const body = await bpim2Get<{ rankings?: RawRow[]; totalCount?: number }>(songPaths(route, userId, version).global);
  return body ? { rows: body.rankings ?? [], totalCount: body.totalCount } : null;
}
