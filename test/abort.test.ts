import { describe, expect, it } from "vitest";
import { isAbortError, raceAbort } from "@/lib/async/abort";

describe("raceAbort", () => {
  it("中止されなければ、処理の結果をそのまま返す", async () => {
    const c = new AbortController();
    expect(await raceAbort(Promise.resolve(42), c.signal)).toBe(42);
  });

  it("中止されたら、処理の完了を待たずに AbortError で失敗する", async () => {
    const c = new AbortController();
    const never = new Promise<number>(() => undefined);
    const raced = raceAbort(never, c.signal);
    c.abort();
    await expect(raced).rejects.toSatisfy(isAbortError);
  });

  it("すでに中止されていれば、すぐ失敗する。中止後に遅れて失敗した処理は、未処理のエラーにならない", async () => {
    const c = new AbortController();
    c.abort();
    let rejectLate: (e: Error) => void = () => undefined;
    const late = new Promise<number>((_, reject) => (rejectLate = reject));
    await expect(raceAbort(late, c.signal)).rejects.toSatisfy(isAbortError);
    rejectLate(new Error("遅れて失敗"));
    await new Promise((r) => setTimeout(r, 0));
  });

  it("通常の失敗は、中止とは区別できる", async () => {
    const c = new AbortController();
    const err = await raceAbort(Promise.reject(new Error("x")), c.signal).catch((e: unknown) => e);
    expect(isAbortError(err)).toBe(false);
  });
});
