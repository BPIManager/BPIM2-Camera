import { initializeApp } from "firebase/app";

/**
 * BPIM2 と同じ Firebase プロジェクト。Web API キーは公開情報（クライアントに埋め込まれる識別子）。
 * authDomain はこのアプリ自身のホストにする。`/__/auth/*` を bpimv2.firebaseapp.com へ中継（vite.config.ts / README 参照）し、
 * ブラウザの保存領域の分離（別ドメインの iframe では、リダイレクトの結果を受け取れない）を避ける。
 */
export const firebaseApp = initializeApp({
  apiKey: "AIzaSyAIlzzxI0kZtIe4vvjSIiRwfqSQVZtbluM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? location.host,
  projectId: "bpimv2",
  storageBucket: "bpimv2.appspot.com",
  messagingSenderId: "199747072203",
  appId: "1:199747072203:web:79b7545a4e426763b5ab4e",
});
