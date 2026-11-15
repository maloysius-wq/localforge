/** IDs mirror the allowlisted catalog in src-tauri/src/model_catalog.rs.
 *  Only Rust owns the model URLs and verifies the on-disk download hash. */
export const MODEL_CATALOG = [
  {
    id: "qwen25-coder-15b",
    label: "Qwen2.5-Coder 1.5B",
    size: "~1.1 GB",
    license: "Apache 2.0",
    source: "Qwen official GGUF",
    description: "Smallest and fastest option for low-memory machines.",
  },
  {
    id: "qwen25-coder-3b",
    label: "Qwen2.5-Coder 3B",
    size: "~2.1 GB",
    license: "Qwen Research (noncommercial)",
    source: "Qwen official GGUF",
    description: "Coding-focused experimental comparison; check licensing before use.",
  },
  {
    id: "qwen3-4b-instruct-2507",
    label: "Qwen3-4B-Instruct-2507",
    size: "~2.5 GB",
    license: "Apache 2.0",
    source: "Unsloth GGUF of Qwen's model",
    description: "Newer general instruct model; potentially better reasoning, heavier on RAM.",
  },
] as const;
export type CatalogModelId = (typeof MODEL_CATALOG)[number]["id"];
export const DEFAULT_MODEL_ID: CatalogModelId = "qwen25-coder-15b";
export function isCatalogModelId(value: unknown): value is CatalogModelId {
  return MODEL_CATALOG.some(model => model.id === value);
}
