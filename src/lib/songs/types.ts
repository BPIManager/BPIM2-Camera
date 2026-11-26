import type { Difficulty, PlayStyle } from "@/lib/domain/types";

/** 曲マスタ（BPIM2 の allSongs 相当。☆1〜12 全難易度） */
export interface SongMasterEntry {
  songId: number;
  title: string;
  artist?: string;
  playStyle: PlayStyle;
  difficulty: Difficulty;
  level: number;
  notes: number;
}

export interface SongMaster {
  /** データの版。ETag 比較・更新判定に使う */
  version: string;
  songs: SongMasterEntry[];
}
