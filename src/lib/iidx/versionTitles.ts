/** IIDX のバージョンタイトル。履歴をバージョンごとにまとめる見出しに使う（BPIM2 本体の versionTitles と同じ表記） */
const TITLES: Record<string, string> = {
  "26": "26 Rootage",
  "27": "27 HEROIC VERSE",
  "28": "28 BISTROVER",
  "29": "29 CastHour",
  "30": "30 RESIDENT",
  "31": "31 EPOLIS",
  "32": "32 Pinky Crush",
  "33": "33 Sparkle Shower",
  "34": "34 ZINRAI",
  INF: "INFINITAS",
};

export const versionTitle = (version: string): string => TITLES[version] ?? (/^\d+$/.test(version) ? `Ver.${version}` : version);
