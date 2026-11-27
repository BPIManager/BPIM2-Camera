import { describe, expect, it } from "vitest";
import { parseUseOption } from "@/lib/recognition/useOption";

const lines = (...t: string[]) => t.map((text) => ({ text }));

describe("parseUseOption", () => {
  it("実機の読み（見出しが崩れていても、後ろのオプション名を拾う）", () => {
    expect(parseUseOption(lines("USE OPTION RANDOM"))).toBe("RANDOM");
    expect(parseUseOption(lines("TION RANDOM"))).toBe("RANDOM");
    expect(parseUseOption(lines("USEOPTIONRANDOM"))).toBe("RANDOM");
    expect(parseUseOption(lines("OPTION", "S-RANDOM"))).toBe("S-RANDOM");
    expect(parseUseOption(lines("EOPTION S-RANDOM"))).toBe("S-RANDOM");
    expect(parseUseOption(lines("CHUONE RANDOM"))).toBe("RANDOM");
    expect(parseUseOption(lines("USE OPTION \"RANDOM"))).toBe("RANDOM");
  });
  it("見出しの読み崩れの H を、H-RANDOM と取らない", () => {
    expect(parseUseOption(lines("POHRANDOM"))).toBe("RANDOM");
  });
  it("OFF・MIRROR・R-RANDOM", () => {
    expect(parseUseOption(lines("USE OPTION OFF"))).toBe("OFF");
    expect(parseUseOption(lines("USE OPTION MIRROR"))).toBe("MIRROR");
    expect(parseUseOption(lines("USE OPTION R-RANDOM"))).toBe("R-RANDOM");
  });
  it("DP の左右の組", () => {
    expect(parseUseOption(lines("USE OPTION RAN / MIR"))).toBe("RAN / MIR");
  });
  it("オプション名が読めなければ null", () => {
    expect(parseUseOption(lines("USE OPTION"))).toBeNull();
    expect(parseUseOption(lines("ベストスコア", "F-COMBO"))).toBeNull();
    expect(parseUseOption(lines())).toBeNull();
  });
});
