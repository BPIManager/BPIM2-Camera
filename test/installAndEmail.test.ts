import { describe, expect, it } from "vitest";
import { emailLinkErrorMessage, isValidEmail, normalizeEmail } from "@/lib/firebase/email";
import { installModeOf } from "@/lib/pwa/install";

describe("アプリとして追加する方法の判定", () => {
  it("すでにアプリとして開いていれば案内は不要（他の条件より優先）", () => {
    expect(installModeOf({ standalone: true, ios: true, hasPrompt: true })).toBe("installed");
  });

  it("ブラウザのインストールダイアログが使えれば native。なければ iOS は手順、それ以外はブラウザのメニュー", () => {
    expect(installModeOf({ standalone: false, ios: false, hasPrompt: true })).toBe("native");
    expect(installModeOf({ standalone: false, ios: true, hasPrompt: false })).toBe("ios");
    expect(installModeOf({ standalone: false, ios: false, hasPrompt: false })).toBe("manual");
  });
});

describe("メールリンクのサインイン", () => {
  it("アドレスは前後の空白を除いて小文字にそろえ、形式だけを確かめる", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
    expect(isValidEmail(" a@b.co ")).toBe(true);
    expect(["", "a", "a@b", "a b@c.d", "@b.c"].some(isValidEmail)).toBe(false);
  });

  it("エラーコードごとに、直し方が分かる文言を返す", () => {
    expect(emailLinkErrorMessage("auth/invalid-action-code")).toContain("有効期限");
    expect(emailLinkErrorMessage("auth/unauthorized-continue-uri")).toContain("許可リスト");
    expect(emailLinkErrorMessage("auth/too-many-requests")).toContain("多すぎ");
    expect(emailLinkErrorMessage("something-else")).toContain("もう一度");
  });
});
