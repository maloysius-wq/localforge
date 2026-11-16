import { describe, expect, it } from "vitest";
import { formatGenerationDuration } from "./generationTime";

describe("response duration display", () => {
  it("counts elapsed seconds without rounding up", () => {
    expect(formatGenerationDuration(0)).toBe("0:00");
    expect(formatGenerationDuration(999)).toBe("0:00");
    expect(formatGenerationDuration(1000)).toBe("0:01");
    expect(formatGenerationDuration(61_999)).toBe("1:01");
  });
  it("supports long CPU generations and ignores invalid timestamps", () => {
    expect(formatGenerationDuration(3_661_000)).toBe("1:01:01");
    expect(formatGenerationDuration(-500)).toBe("0:00");
    expect(formatGenerationDuration(Number.NaN)).toBe("0:00");
    expect(formatGenerationDuration(Infinity)).toBe("0:00");
  });
});
