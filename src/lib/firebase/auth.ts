import { indexedDBLocalPersistence, browserLocalPersistence, initializeAuth, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { firebaseApp } from "./config";

/** email は、signin.html でメールアドレスを入力して、サインイン用のリンクを送ってもらう */
export type SignInProvider = "google" | "twitter" | "line" | "email";

/** 同じ端末の signin.html（隔離なしのページ）と、IndexedDB の保存先を共有するので、ここで復元できる */
const auth = initializeAuth(firebaseApp, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });

export const onUserChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb);

export const signOutUser = () => signOut(auth);

/** サインイン中なら ID トークン。未サインインは null */
export async function currentIdToken(): Promise<string | null> {
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/**
 * サインインは signin.html で行う。このアプリは SharedArrayBuffer のために COOP/COEP で隔離しており、
 * Firebase のポップアップ・リダイレクト用 iframe がそれに阻まれるため、隔離していない別ページに任せる。
 */
export function startSignIn(provider: SignInProvider, returnTo = "/") {
  const q = new URLSearchParams({ provider, returnTo });
  window.location.assign(`/signin.html?${q}`);
}
