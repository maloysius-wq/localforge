import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, isCatalogModelId, isGpuModel, DEFAULT_MODEL_ID } from "./modelCatalog";

describe("experimental Bonsai catalog guard", () => {
  it("preserves the original CPU default", () => {
    expect(DEFAULT_MODEL_ID).toBe("qwen25-coder-15b");
    expect(isGpuModel(DEFAULT_MODEL_ID)).toBe(false);
  });
  it("adds a distinct experimental model with no implicit CPU/GPU assumption", () => {
    expect(MODEL_CATALOG.length).toBe(4);
    expect(isCatalogModelId("bonsai-27b-q1")).toBe(true);
    expect(isGpuModel("bonsai-27b-q1")).toBe(true);
    expect(MODEL_CATALOG.find(m => m.id === "bonsai-27b-q1")?.size).toBe("~3.8 GB");
    expect(isCatalogModelId("unknown")).toBe(false);
  });
});
