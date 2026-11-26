import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { fetchBpim2Profile, type Bpim2Profile } from "@/lib/bpi/me";

/** BPIM2 上のユーザー名とアイコン。loading の間は null、未登録・失敗でも null */
export function useBpim2Profile(user: User | null) {
  const [state, setState] = useState<{ uid: string; profile: Bpim2Profile | null } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user
      .getIdToken()
      .then(fetchBpim2Profile)
      .then((profile) => !cancelled && setState({ uid: user.uid, profile }));
    return () => {
      cancelled = true;
    };
  }, [user]);
  return { profile: state && user && state.uid === user.uid ? state.profile : null, loaded: state !== null && state.uid === user?.uid };
}
