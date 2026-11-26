import { useEffect, useState } from "react";

/**
 * key が変わるたびに load を呼んで結果を返す。key が null のときは何もしない。
 * loading は「key があるのに、その key の結果がまだ届いていない」ことから導く（古い key の結果は出さない）。
 * data が null のまま loading が false なら、取得に失敗した（未サインイン・通信失敗など）。
 */
export function useRemote<T>(key: string | null, load: () => Promise<T | null>): { data: T | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; data: T | null } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    void load().then((data) => !cancelled && setState({ key, data }));
    return () => {
      cancelled = true;
    };
    // load は key に対応して決まる（key が同じなら呼び直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fresh = key !== null && state?.key === key;
  return { data: fresh ? state.data : null, loading: key !== null && !fresh };
}
