import { describe, it, expect } from "vitest";
import { DEFAULT_MODEL_ID, isCatalogModelId, MODEL_CATALOG } from "./modelCatalog";

describe("bundled model catalog", () => {
  it("keeps the legacy model as the default", () => {
    expect(DEFAULT_MODEL_ID).toBe("qwen25-coder-15b");
  });
  it("provides all three test candidates with their source and licenses", () => {
    expect(MODEL_CATALOG.map(model => model.id)).toEqual([
      "qwen25-coder-15b", "qwen25-coder-3b", "qwen3-4b-instruct-2507",
    ]);
    expect(MODEL_CATALOG.every(model => model.source && model.license)).toBe(true);
  });
  it("rejects unknown stored model identifiers", () => {
    expect(isCatalogModelId("qwen25-coder-3b")).toBe(true);
    expect(isCatalogModelId("../unsafe")).toBe(false);
    expect(isCatalogModelId(null)).toBe(false);
  });
});
