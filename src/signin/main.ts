import { GoogleAuthProvider, OAuthProvider, TwitterAuthProvider, getAuth, getRedirectResult, isSignInWithEmailLink, signInWithEmailLink, signInWithRedirect, type Auth } from "firebase/auth";
import { firebaseApp } from "@/lib/firebase/config";
import { PENDING_EMAIL_KEY, isValidEmail, normalizeEmail } from "@/lib/firebase/email";
import { requestMagicLink } from "@/lib/firebase/magicLink";

/**
 * 隔離（COOP/COEP）していないページで、リダイレクト方式のサインインを行う。
 * 往路：provider を受けて Firebase へ遷移。復路：結果を受け取り、元の画面へ戻る。
 * 結果は Firebase の保存先（IndexedDB）に残るので、アプリ本体は戻ったときに復元する。
 */
const params = new URLSearchParams(location.search);
// Firebase は、リダイレクトを始めたときの URL へ戻す。始める直前に phase=return を足しておけば、復路をそれで見分けられる
// （sessionStorage のフラグだと、途中で離脱したときに残り、次の往路が復路扱いになる）
const isReturn = params.get("phase") === "return";
const provider = params.get("provider");
const rawReturn = params.get("returnTo") ?? "/";
// 外部サイトへ飛ばさないよう、このオリジンのパスだけ許す
const returnTo = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";

const providers = {
  google: () => new GoogleAuthProvider(),
  twitter: () => new TwitterAuthProvider(),
  line: () => new OAuthProvider("oidc.line"),
} as const;

/** メッセージと、アプリへ戻るリンクを表示して止まる */
function showMessage(text: string) {
  const msg = document.getElementById("msg")!;
  msg.textContent = text;
  msg.style.whiteSpace = "pre-wrap";
  const a = document.createElement("a");
  a.href = returnTo;
  a.textContent = "アプリに戻る";
  a.style.display = "block";
  a.style.marginTop = "1rem";
  a.style.color = "inherit";
  msg.append(a);
}

const back = (error?: string) => {
  const url = new URL(returnTo, location.origin);
  if (error) url.searchParams.set("authError", error);
  location.replace(url);
};

/** 別の端末でリンクを開いたとき（送ったアドレスが分からないとき）に、アドレスを入力してもらう */
function askEmail(): Promise<string> {
  return new Promise((resolve) => {
    const msg = document.getElementById("msg")!;
    msg.textContent = "リンクを送ったメールアドレスを入力してください";
    const form = document.createElement("form");
    form.style.cssText = "display:flex;flex-direction:column;gap:.75rem;margin-top:1rem";
    const input = document.createElement("input");
    input.type = "email";
    input.required = true;
    input.autocomplete = "email";
    input.style.cssText = "padding:.6rem;border-radius:.5rem;border:1px solid #444;background:#1b1f27;color:inherit;font-size:1rem";
    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "サインイン";
    button.style.cssText = "padding:.7rem;border-radius:.5rem;border:0;background:#4fd8e6;color:#0f1115;font-size:1rem;font-weight:600";
    form.append(input, button);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (isValidEmail(input.value)) resolve(normalizeEmail(input.value));
    });
    msg.append(form);
  });
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
  reset: (widgetId: string) => void;
}

/** Turnstile のスクリプトを読み込む（隔離していないこのページでは、ウィジェットの iframe が阻まれない） */
function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => reject(new Error("turnstile failed to load"));
    document.head.append(s);
  });
}

/** メールアドレスを入力して、サインイン用のリンクを送ってもらう（Turnstile の確認つき） */
function renderEmailForm() {
  const msg = document.getElementById("msg")!;
  msg.textContent = "メールアドレスを入力すると、サインイン用のリンクを送ります";
  msg.style.whiteSpace = "pre-wrap";
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  if (!siteKey) {
    showMessage("Turnstile のサイトキー（VITE_TURNSTILE_SITE_KEY）が設定されていません。");
    return;
  }

  const form = document.createElement("form");
  form.style.cssText = "display:flex;flex-direction:column;gap:.75rem;margin-top:1rem;text-align:left";
  const input = document.createElement("input");
  input.type = "email";
  input.required = true;
  input.autocomplete = "email";
  input.placeholder = "example@mail.com";
  input.style.cssText = "padding:.6rem;border-radius:.5rem;border:1px solid #444;background:#1b1f27;color:inherit;font-size:1rem";
  const captcha = document.createElement("div");
  const note = document.createElement("p");
  note.setAttribute("role", "alert");
  note.style.cssText = "margin:0;font-size:.85rem;color:#ff8a80;white-space:pre-wrap";
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "リンクを送る";
  button.style.cssText = "padding:.7rem;border-radius:.5rem;border:0;background:#4fd8e6;color:#0f1115;font-size:1rem;font-weight:600";
  form.append(input, captcha, note, button);
  msg.append(form);

  let token = "";
  let widgetId = "";
  let turnstile: TurnstileApi | null = null;
  loadTurnstile()
    .then((t) => {
      turnstile = t;
      widgetId = t.render(captcha, {
        sitekey: siteKey,
        callback: (v) => (token = v),
        "expired-callback": () => (token = ""),
        "error-callback": () => (token = ""),
      });
    })
    .catch(() => (note.textContent = "ボット確認を読み込めませんでした。通信を確認して、ページを開き直してください。"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    note.textContent = "";
    if (!isValidEmail(input.value)) {
      note.textContent = "メールアドレスの形式が正しくありません";
      return;
    }
    if (!token) {
      note.textContent = "ボット確認が終わるまで、少しお待ちください";
      return;
    }
    button.disabled = true;
    button.textContent = "送っています";
    const result = await requestMagicLink({ email: input.value, turnstileToken: token, returnTo, origin: location.origin });
    if (result.ok) {
      try {
        localStorage.setItem(PENDING_EMAIL_KEY, normalizeEmail(input.value));
      } catch {
        /* 保存できなくても、リンクを開いたときにアドレスを入力してもらえば完了できる */
      }
      showMessage(`メールを送りました。\n${input.value.trim()} に届いたリンクを開くと、サインインできます。\n届かないときは、迷惑メールのフォルダも確認してください。`);
      return;
    }
    // トークンは使い捨て。失敗したら、ウィジェットを作り直して再送できるようにする
    note.textContent = result.message;
    token = "";
    if (turnstile && widgetId) turnstile.reset(widgetId);
    button.disabled = false;
    button.textContent = "リンクを送る";
  });
}

/** メールのリンクから戻ったとき: 送ったアドレスでサインインを完了する */
async function completeEmailLink(auth: Auth) {
  let email: string | null = null;
  try {
    email = localStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    /* 保存領域が使えなければ、入力してもらう */
  }
  await signInWithEmailLink(auth, email ?? (await askEmail()), location.href);
  try {
    localStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    /* 消せなくても害はない */
  }
  back();
}

async function run() {
  const auth = getAuth(firebaseApp);
  if (isSignInWithEmailLink(auth, location.href)) {
    await completeEmailLink(auth);
    return;
  }
  if (isReturn) {
    // 復路。結果が null でサインイン済みでもないときは、黙って戻らず理由を表示する
    // （authDomain とこのアプリが別ドメインだと、ブラウザの保存領域の分離で結果を受け取れないことがある）
    try {
      const result = await getRedirectResult(auth);
      await auth.authStateReady();
      if (!result && !auth.currentUser) {
        showMessage(`サインインの結果を受け取れませんでした。
authDomain: ${auth.config.authDomain} / このページ: ${location.host}
途中でやめた場合は、もう一度お試しください。`);
        return;
      }
      back();
    } catch (e) {
      back((e as { code?: string }).code ?? "unknown");
    }
    return;
  }
  if (provider === "email") {
    renderEmailForm();
    return;
  }
  if (provider === "google" || provider === "twitter" || provider === "line") {
    // authDomain はこのホスト。/__/auth/ が Firebase へ中継されていないと、アプリの画面（index.html）が返って、
    // 何も表示されずにアプリへ戻ったように見える。遷移の前に確かめる
    const probe = await fetch("/__/auth/handler", { cache: "no-store" }).then((r) => r.text(), () => "");
    if (!probe.includes("fireauth")) {
      showMessage(`/__/auth/handler が Firebase に中継されていません（${location.host}）。
サーバーの設定（README「サインイン（Firebase）の設定」）を確認してください。`);
      return;
    }
    params.set("phase", "return");
    history.replaceState(null, "", `${location.pathname}?${params}`);
    await signInWithRedirect(auth, providers[provider]());
    return;
  }
  back("invalid-provider");
}

run().catch((e: unknown) => back((e as { code?: string }).code ?? "unknown"));
