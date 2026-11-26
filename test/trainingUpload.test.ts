import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { resetDbForTest, type TrainingSample } from "@/lib/storage/db";
import { countPendingSamples, listSamples, saveSample } from "@/lib/storage/samples";
import { canUpload, flushSamples } from "@/lib/training/upload";
import { handle, type Env } from "../worker/src/index";
import { presignUrl } from "../worker/src/presign";
import { record } from "./fixtures";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTest();
});

const sample = (id: string): TrainingSample => ({
  id,
  createdAt: 1,
  playSide: "1P",
  chart: record().chart,
  exScore: 1796,
  autoConfirmed: true,
  correctedFields: [],
  scoreCrop: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  titleCrop: new Blob([new Uint8Array([4, 5])], { type: "image/jpeg" }),
});

const env: Env = { R2_ACCOUNT_ID: "acct", R2_BUCKET: "bkt", R2_ACCESS_KEY_ID: "AK", R2_SECRET_ACCESS_KEY: "SK", ALLOWED_ORIGINS: "https://app.example" };
const req = (body: unknown, init: RequestInit = {}) =>
  new Request("https://w.example/v1/upload-urls", { method: "POST", body: JSON.stringify(body), headers: { Origin: "https://app.example" }, ...init });
const good = { deviceId: "11111111-2222-3333-4444-555555555555", id: "sample-0001", files: [{ name: "score", size: 3 }, { name: "title", size: 2 }, { name: "labels", size: 100 }] };

describe("presignUrl", () => {
  it("AWS 公式ドキュメントの署名例と一致する", async () => {
    const url = await presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresIn: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  });
});

describe("署名付き URL を発行する Worker", () => {
  it("正しい要求には、ファイルごとの PUT URL を返す（キーはサンプル単位）", async () => {
    const res = await handle(req(good), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");
    const { uploads } = (await res.json()) as { uploads: { name: string; url: string }[] };
    expect(uploads.map((u) => u.name)).toEqual(["score", "title", "labels"]);
    expect(uploads[0].url).toContain(`https://acct.r2.cloudflarestorage.com/bkt/samples/${good.deviceId}/sample-0001/score.jpg?`);
    expect(uploads[0].url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
  });

  it.each([
    ["パスを抜ける id", { ...good, id: "../../etc" }],
    ["未知のファイル名", { ...good, files: [...good.files, { name: "evil", size: 1 }] }],
    ["大きすぎる画像", { ...good, files: [{ name: "score", size: 10_000_000 }, good.files[1], good.files[2]] }],
    ["labels がない", { ...good, files: good.files.slice(0, 2) }],
    ["重複したファイル", { ...good, files: [...good.files, good.files[0]] }],
  ])("%s は 400 で断る", async (_n, body) => {
    expect((await handle(req(body), env)).status).toBe(400);
  });

  it("許可していないオリジンには CORS ヘッダーを付けない / POST 以外と別パスは断る", async () => {
    const res = await handle(req(good, { headers: { Origin: "https://evil.example" } }), env);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await handle(new Request("https://w.example/v1/upload-urls"), env)).status).toBe(405);
    expect((await handle(new Request("https://w.example/x", { method: "POST" }), env)).status).toBe(404);
  });
});

describe("flushSamples", () => {
  const fakeFetch = (failPut = false) =>
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://w.example/v1/upload-urls") {
        const { files } = JSON.parse(String(init?.body)) as { files: { name: string }[] };
        return Response.json({ uploads: files.map((f) => ({ name: f.name, url: `https://r2.example/${f.name}`, contentType: f.name === "labels" ? "application/json" : "image/jpeg" })) });
      }
      return new Response(null, { status: failPut ? 500 : 200 });
    });
  const opts = (f: typeof fetch) => ({ endpoint: "https://w.example/v1/upload-urls", deviceId: "11111111-2222-3333-4444-555555555555", fetchImpl: f });

  it("未送信のサンプルを送り、送れたものに送信済みの印を付ける（2 回目は送らない）", async () => {
    await saveSample(sample("sample-0001"));
    await saveSample(sample("sample-0002"));
    const f = fakeFetch();
    expect(await flushSamples(opts(f as unknown as typeof fetch))).toEqual({ uploaded: 2, failed: 0 });
    // 1 サンプルあたり、URL 発行 1 回 + PUT 3 回（score・title・labels。judge はない）
    expect(f).toHaveBeenCalledTimes(8);
    expect(await countPendingSamples()).toBe(0);
    expect((await listSamples()).every((s) => s.uploadedAt !== undefined)).toBe(true);
    expect(await flushSamples(opts(f as unknown as typeof fetch))).toEqual({ uploaded: 0, failed: 0 });
  });

  it("PUT に失敗したサンプルは未送信のまま残す", async () => {
    await saveSample(sample("sample-0001"));
    expect(await flushSamples(opts(fakeFetch(true) as unknown as typeof fetch))).toEqual({ uploaded: 0, failed: 1 });
    expect(await countPendingSamples()).toBe(1);
  });
});

describe("canUpload", () => {
  it("同意があり、画像を含める設定のときだけ送る", () => {
    expect(canUpload({ statsConsent: true, statsIncludeImage: true })).toBe(true);
    expect(canUpload({ statsConsent: true, statsIncludeImage: false })).toBe(false);
    expect(canUpload({ statsConsent: null, statsIncludeImage: true })).toBe(false);
  });
});
