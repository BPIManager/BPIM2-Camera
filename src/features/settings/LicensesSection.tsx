import licenses from "@/generated/licenses.json";

interface Entry {
  name: string;
  version: string;
  license: string;
  homepage: string;
}

/** ライブラリ以外で、同梱しているデータ・モデル */
const EXTRAS: Entry[] = [
  {
    name: "PaddleOCR 認識モデル（ONNX 変換版）",
    version: "",
    license: "Apache-2.0",
    homepage: "https://github.com/PaddlePaddle/PaddleOCR",
  },
  {
    name: "Tesseract OCR 学習データ",
    version: "",
    license: "Apache-2.0",
    homepage: "https://github.com/tesseract-ocr/tessdata",
  },
];

const ALL = [...(licenses as Entry[]), ...EXTRAS];

/** ライセンスごとに分けた一覧（件数の多い順） */
const GROUPS = Object.entries(
  ALL.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.license] ??= []).push(e);
    return acc;
  }, {}),
).sort((a, b) => b[1].length - a[1].length);

/** オープンソースライセンスの表記。閉じた状態で置く */
export default function LicensesSection() {
  return (
    <details className="group border-b border-border py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        オープンソースライセンス
        <span
          aria-hidden
          className="text-muted-foreground transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          このアプリは、次のオープンソースのソフトウェアを利用しています。
          <br />
          また、BPIM2-Cameraは AGPL-3.0 でライセンスされています。 (
          <a
            href="https://github.com/BPIManager/BPIM2-Camera"
            target="_blank"
            className="underline-offset-2 hover:underline"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          )
        </p>
        {GROUPS.map(([license, entries]) => (
          <section key={license} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold">
              {license}
              <span className="ml-1 font-normal text-muted-foreground">
                （{entries.length}）
              </span>
            </h3>
            <ul className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {entries.map((e) => (
                <li key={`${e.name}@${e.version}`}>
                  {e.homepage ? (
                    <a
                      href={e.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {e.name}
                    </a>
                  ) : (
                    e.name
                  )}
                  {e.version && (
                    <span className="opacity-70"> {e.version}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
