/** メールリンクでサインインするときの、送ったアドレスの保存先（リンクを開いたとき、同じ端末なら入力を省く） */
export const PENDING_EMAIL_KEY = "bpim2-camera:pending-email";

/** 前後の空白を除き、小文字にそろえる（Firebase のメールアドレスの扱いに合わせる） */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** 形式だけの簡易チェック（実在の確認は、メールが届くかどうかで行う） */
export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

/** メールリンクの送信・完了で出る Firebase のエラーコードを、画面に出す文言にする */
export function emailLinkErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくないか、リンクを送ったアドレスと違います";
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "リンクの有効期限が切れているか、すでに使われています。もう一度メールを送ってください";
    case "auth/unauthorized-continue-uri":
    case "auth/unauthorized-domain":
      return "このアプリの URL が、サインインの許可リストにありません";
    case "auth/operation-not-allowed":
      return "メールリンクでのサインインが有効になっていません";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "メールの送信が多すぎます。しばらくしてからお試しください";
    case "auth/network-request-failed":
      return "通信できませんでした。接続を確認してください";
    default:
      return "メールを送れませんでした。もう一度お試しください";
  }
}
