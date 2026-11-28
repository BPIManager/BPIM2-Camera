import type { ClearType } from "@/lib/domain/types";

/** 選べるクリアランプ（弱い順。NO PLAY は除く）と、閉じているときの短い名前 */
export const LAMPS: readonly { value: ClearType; short: string }[] = [
  { value: "FAILED", short: "FL" },
  { value: "ASSIST CLEAR", short: "AS" },
  { value: "EASY CLEAR", short: "EC" },
  { value: "CLEAR", short: "CL" },
  { value: "HARD CLEAR", short: "HC" },
  { value: "EX HARD CLEAR", short: "EXH" },
  { value: "FULLCOMBO CLEAR", short: "FC" },
];

/** クリアランプの短い名前。分からなければ — */
export const lampShort = (c: ClearType | null): string => LAMPS.find((l) => l.value === c)?.short ?? "—";

/** 使用オプションの短い名前（SP の名前と、DP の左右の略記）。ここにないものは、そのまま出す */
const OPTION_SHORT: Record<string, string> = {
  RANDOM: "R",
  "R-RANDOM": "RR",
  "S-RANDOM": "SR",
  "H-RANDOM": "HR",
  MIRROR: "MR",
  RAN: "R",
  "R-RAN": "RR",
  "S-RAN": "SR",
  "H-RAN": "HR",
  MIR: "MR",
};

/** 使用オプションの短い名前。DP の組（「RAN / MIR」）は、左右それぞれを短くする */
export const optionShort = (option: string): string =>
  option
    .split("/")
    .map((side) => side.trim())
    .map((side) => OPTION_SHORT[side] ?? side)
    .join(" / ");
