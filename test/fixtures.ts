import type { ResultRecord } from "@/lib/domain/types";
import type { SongMasterEntry } from "@/lib/songs/types";

export const heartache: SongMasterEntry = {
  songId: 1,
  title: "HEARTACHE",
  playStyle: "SP",
  difficulty: "ANOTHER",
  level: 10,
  notes: 930,
};

export const master: SongMasterEntry[] = [
  heartache,
  { songId: 2, title: "UNDO THE NIGHT", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1774 },
  { songId: 3, title: "Angel's Ladder", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1775 },
  { songId: 4, title: "Boomy and The Boost", playStyle: "SP", difficulty: "ANOTHER", level: 12, notes: 1813 },
  { songId: 5, title: "Dummy A", playStyle: "SP", difficulty: "HYPER", level: 10, notes: 800 },
  { songId: 6, title: "Dummy B", playStyle: "SP", difficulty: "HYPER", level: 10, notes: 800 },
];

export function record(over: Partial<ResultRecord> = {}): ResultRecord {
  return {
    id: "r1",
    createdAt: 0,
    chart: {
      songId: 1,
      title: heartache.title,
      playStyle: "SP",
      difficulty: "ANOTHER",
      level: 10,
      notes: 930,
    },
    exScore: 1796,
    bestExScore: 0,
    judge: { pgreat: 867, great: 62, good: 1, bad: 0, poor: 0, fast: 37, slow: 26 },
    missCount: 0,
    bestMissCount: null,
    clearType: "FULLCOMBO CLEAR",
    bestClearType: "FULLCOMBO CLEAR",
    djLevel: "AAA",
    useOption: "RANDOM",
    bpi: null,
    bpiStatus: "unsupported-level",
    estimatedRank: null,
    source: "import",
    correctedFields: [],
    imageKey: null,
    ...over,
  };
}
