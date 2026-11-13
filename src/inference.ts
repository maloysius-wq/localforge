import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type EngineStatus = { running: boolean; model: string | null; generating: boolean };
export type ModelInfo = { installed: boolean; path: string; size: number };
export type DownloadProgress = { received: number; total: number; status: "downloading" | "complete" };
export type TokenEvent = { requestId: string; delta: string };
export type ContextUsageEvent = { requestId: string; usedTokens: number; maxTokens: number; kind: "prompt" | "total" };
export type GenerationMessage = { role: "user" | "assistant"; content: string };

export const emptyStatus: EngineStatus = { running: false, model: null, generating: false };
export const emptyModel: ModelInfo = { installed: false, path: "", size: 0 };
export const native = isTauri;
export const getStatus = () => invoke<EngineStatus>("engine_status");
export const getModelInfo = () => invoke<ModelInfo>("model_info");
export const downloadModel = () => invoke<ModelInfo>("download_model");
export const startModel = (modelPath: string | null, threads: number, contextTokens: number) => invoke<EngineStatus>("start_model", { modelPath, threads, contextTokens });
export const stopModel = () => invoke<EngineStatus>("stop_model");
export const generate = (requestId: string, messages: GenerationMessage[], projectContext: string | null = null, codeOnly = false) => invoke<string>("generate", { requestId, messages, projectContext, codeOnly });
export const cancelGeneration = () => invoke<void>("cancel_generation");
export const onToken = (handler: (value: TokenEvent) => void) => listen<TokenEvent>("model-token", e => handler(e.payload));
export const onDownload = (handler: (value: DownloadProgress) => void) => listen<DownloadProgress>("model-download", e => handler(e.payload));

export const onContextUsage = (handler: (value: ContextUsageEvent) => void) => listen<ContextUsageEvent>("model-context", e => handler(e.payload));
