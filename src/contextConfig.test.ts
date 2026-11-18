import { describe, it, expect } from "vitest";
import { CONTEXT_CHOICES, DEFAULT_CONTEXT_TOKENS, validContextTokens, contextBudget } from "./contextConfig";
describe("context settings", () => {
  it("offers optional 64K while keeping a lower-RAM default", () => {
    expect(CONTEXT_CHOICES).toContain(65536);
    expect(DEFAULT_CONTEXT_TOKENS).toBeLessThan(8192);
    expect(validContextTokens(65536)).toBe(true);
    expect(validContextTokens(64000)).toBe(false);
  });
  it("retains much more source at 64K", () => {
    expect(contextBudget(65536).source).toBeGreaterThan(contextBudget(6144).source*10);
  });
});

describe("Bonsai long context on limited VRAM", () => {
  it("offers native 32K while preserving small CPU defaults", async () => {
    const { BONSAI_CONTEXT_CHOICES, BONSAI_DEFAULT_CONTEXT_TOKENS, restoredContextTokens } = await import("./contextConfig");
    expect(BONSAI_CONTEXT_CHOICES).toEqual([4096,8192,16384,32768]);
    expect(BONSAI_DEFAULT_CONTEXT_TOKENS).toBe(32768);
    expect(restoredContextTokens(4096, true, true)).toBe(32768); // migrate installed v0.3.14
    expect(restoredContextTokens(4096, true, false)).toBe(4096); // user explicitly opts back down
    expect(restoredContextTokens(65536, true, false)).toBe(32768);
    expect(restoredContextTokens(6144, false, false)).toBe(6144);
  });
  it("lets the 32K budget retain more multi-file source than before", async () => {
    const { contextBudget } = await import("./contextConfig");
    expect(contextBudget(32768).source).toBeGreaterThan(60000);
    expect(contextBudget(32768).project).toBeGreaterThan(30000);
  });
});
