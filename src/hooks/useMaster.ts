import { useEffect, useState } from "react";
import { loadMaster, refreshMaster } from "@/lib/songs/repository";
import type { SongMasterEntry } from "@/lib/songs/types";

/** 起動時にマスタを読み、裏で更新を確認する（画面表示は待たせない） */
export function useMaster() {
  const [songs, setSongs] = useState<SongMasterEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMaster()
      .then((m) => {
        if (!alive) return;
        setSongs(m.songs);
        setReady(true);
        return refreshMaster().then(async (updated) => {
          if (updated && alive) setSongs((await loadMaster()).songs);
        });
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return { songs, ready };
}
