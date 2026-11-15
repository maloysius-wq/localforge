import { extractProposedFiles } from "./autoEdits";
import { inspectWebSource, type WebQualityReport } from "./webQuality";

export type WebCheckPhase = "checking" | "static-pass" | "failed" | "not-applicable";
export type WebCheckProgress = { phase: WebCheckPhase; report: WebQualityReport | null };
export type WebCheckResult = WebCheckProgress & { reply: string };

/**
 * Inspect one model response. Deliberately NEVER invokes a model again.
 * Static source checks are informational and a safe staging gate, not proof
 * that generated HTML behaves correctly in a real browser.
 */
export function verifyFirstPassWeb(
  reply: string,
  originalRequest: string,
  onProgress?: (progress: WebCheckProgress) => void,
): WebCheckResult {
  onProgress?.({ phase: "checking", report: null });
  const extraction = extractProposedFiles(reply, originalRequest);
  const html = extraction.files.find(file => /\.html$/i.test(file.path));
  if (!html || extraction.error) {
    const result: WebCheckResult = { reply, report: null, phase: "not-applicable" };
    onProgress?.(result);
    return result;
  }
  const report = inspectWebSource(html.content, originalRequest);
  const result: WebCheckResult = { reply, report, phase: report.passed ? "static-pass" : "failed" };
  onProgress?.(result);
  return result;
}

export function summarizeQuality(report: WebQualityReport | null): string {
  if (!report) return "No single-file HTML implementation could be inspected.";
  const failed = report.checks.filter(check => !check.passed);
  return failed.length === 0
    ? "Static source checks passed. Browser interactions have NOT been verified."
    : "Failed source checks:\n" + failed.map(check => "- " + check.label + ": " + check.detail).join("\n");
}
