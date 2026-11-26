import SignInButtons from "@/features/auth/SignInButtons";

/** 未サインインのとき、サインインが要る機能の代わりに出す案内 */
export function SignInPrompt({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-center text-sm text-muted-foreground">{text}</p>
      <SignInButtons compact />
    </div>
  );
}
