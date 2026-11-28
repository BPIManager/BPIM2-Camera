import { useEffect, useState } from "react";
import { loadBeatSeekerLink, subscribeBeatSeekerLink, type BeatSeekerLink } from "@/lib/beatSeeker/token";

/** 端末に保存した beat-seeker の連携。読み込み中は undefined、未連携は null */
export function useBeatSeekerLink(): BeatSeekerLink | null | undefined {
  const [link, setLink] = useState<BeatSeekerLink | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => void loadBeatSeekerLink().then((l) => alive && setLink(l));
    load();
    const off = subscribeBeatSeekerLink(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return link;
}
