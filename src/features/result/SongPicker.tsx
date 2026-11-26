import { useState } from "react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { searchSongs } from "@/lib/songs/matcher";
import type { SongMasterEntry } from "@/lib/songs/types";

interface Props {
  songs: readonly SongMasterEntry[];
  candidates: readonly SongMasterEntry[];
  onPick: (e: SongMasterEntry) => void;
}

const DIFF = { BEGINNER: "B", NORMAL: "N", HYPER: "H", ANOTHER: "A", LEGGENDARIA: "L" } as const;

export default function SongPicker({ songs, candidates, onPick }: Props) {
  const [q, setQ] = useState("");
  /** 自動で絞れた候補があるうちは検索欄を出さない。候補にない曲のときだけ開く */
  const [searching, setSearching] = useState(candidates.length === 0);
  const list = searching && q.trim() ? searchSongs(songs, q) : [...candidates];

  return (
    <div className="flex flex-col gap-2">
      {searching ? (
        <Input placeholder="曲名で検索" autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="曲名で検索" />
      ) : (
        <p className="text-sm text-muted-foreground">近い曲から選んでください</p>
      )}
      <ul className="flex max-h-48 flex-col overflow-y-auto">
        {list.map((s) => (
          <li key={s.songId}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 truncate">{s.title}</span>
              <Badge variant="outline">
                {s.playStyle}
                {DIFF[s.difficulty]}☆{s.level}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
      {!searching && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setSearching(true)}>
          候補にない曲を検索
        </Button>
      )}
    </div>
  );
}
