/** 利用規約・プライバシーポリシー・データポリシー。BPIM2 本体のサインイン画面と同じ Notion ページ */
export const TERMS_URL = "https://www.notion.so/BPIM2-3239989ca87a809f8058dc9736f0e197";
export const PRIVACY_URL = TERMS_URL;

export const BPIM2_SITE = "https://bpi2.poyashi.me";

/** BPIM2 のスコアログ。BPIM2 のユーザー ID は Firebase のユーザー ID と同じ */
export const scoreLogUrl = (userId: string, version: string) => `${BPIM2_SITE}/users/${userId}/logs/${version}`;
