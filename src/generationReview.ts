export type GenerationMetadata = {
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  outputLimit: number;
  visibleChars: number;
  reasoningChunks: number;
  sseEvents: number;
  malformedSse: number;
  doneMarker: boolean;
  durationMs: number;
  firstVisibleMs: number | null;
};
export type GenerationResult = { text: string; meta: GenerationMetadata };
export type ReviewOutcome =
  | "accepted" | "rejected_output_limit" | "rejected_runtime_limit" | "rejected_repetition" | "rejected_incomplete_stream"
  | "rejected_unclosed_fence" | "rejected_no_implementation"
  | "rejected_static_checks" | "no_visible_text"
  | "staged" | "staging_failed" | "staging_not_possible";
export type GenerationReview = { outcome: ReviewOutcome; accepted: boolean; warning: string; closedFences: boolean };

// A metadata-only gate: never assume that a partial code block is safe to
// auto-stage, even if an earlier section happened to pass static checks.
export function reviewGeneration(
  text: string,
  meta: GenerationMetadata,
  codeTask: boolean,
  containsImplementation: boolean,
  staticFailed: boolean,
): GenerationReview {
  const fenceStarts = text.match(/(?:^|\n)```[^\r\n]*\r?\n/g)?.length ?? 0;
  const fenceEnds = text.match(/(?:^|\n)```(?=\r?\n|$)/g)?.length ?? 0;
  const closedFences = fenceStarts === fenceEnds;
  if (!text.trim()) return { outcome: "no_visible_text", accepted: false, closedFences,
    warning: "The model produced no visible response. Copy the generation diagnostics in Settings." };
  if (meta.finishReason === "repetition") return { outcome:"rejected_repetition", accepted:false, closedFences,
    warning:"Bonsai began repeating a substantial block of output, so LocalForge stopped the loop to avoid wasting hours. Your partial answer was saved in this conversation, but it is incomplete and was NOT staged or written to project files. No output-token or time cap was reached." };
  if (meta.finishReason === "length") {
    if (meta.outputLimit === -1) {
      return { outcome:"rejected_runtime_limit", accepted:false, closedFences,
        warning:"The model stopped due to a runtime or context-capacity limit, even though LocalForge imposes no output-token cap. The partial code was NOT staged. Copy diagnostics in Settings." };
    }
    const measured = meta.completionTokens == null ? `up to ${meta.outputLimit}` : String(meta.completionTokens);
    return { outcome:"rejected_output_limit", accepted:false, closedFences,
      warning: `The model hit its response-token limit (${measured} generated tokens; configured limit ${meta.outputLimit}). The displayed code is incomplete and was NOT staged. Copy diagnostics in Settings.` };
  }
  if (!meta.doneMarker) return { outcome:"rejected_incomplete_stream", accepted:false, closedFences,
    warning:"The model response stream ended without the final completion marker. The code might be truncated and was NOT staged. Copy diagnostics in Settings." };
  if (codeTask && !closedFences) return { outcome:"rejected_unclosed_fence", accepted:false, closedFences,
    warning:"The model stopped with an unclosed code fence. The partial code was NOT staged. Copy diagnostics in Settings." };
  if (staticFailed) return { outcome:"rejected_static_checks", accepted:false, closedFences,
    warning:"First-pass static checks failed. No source changes were automatically staged." };
  if (codeTask && !containsImplementation) return { outcome:"rejected_no_implementation", accepted:false, closedFences,
    warning:"The response did not include a complete implementation. No source changes were automatically staged. Copy diagnostics in Settings." };
  return { outcome:"accepted", accepted:true, closedFences, warning:"" };
}
