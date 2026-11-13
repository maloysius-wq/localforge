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
