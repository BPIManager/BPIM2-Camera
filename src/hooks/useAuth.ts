import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onUserChange } from "@/lib/firebase/auth";

/** BPIM2 アカウントのサインイン状態。復元が終わるまで ready は false */
export function useAuth() {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: null, ready: false });
  useEffect(() => onUserChange((user) => setState({ user, ready: true })), []);
  return state;
}
