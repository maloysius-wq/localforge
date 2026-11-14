import { extractProposedFiles } from "./autoEdits";
import { buildRepairRequest, inspectWebSource, type WebQualityReport } from "./webQuality";

export type WebRepairPhase = "checking" | "repairing" | "static-pass" | "failed" | "not-applicable";
export type WebRepairProgress = { phase: WebRepairPhase; repairs: number; report: WebQualityReport | null };
export type WebRepairResult = WebRepairProgress & { reply: string };
export const MAX_WEB_REPAIRS = 2;

export async function verifyAndRepairWeb(
  initialReply: string,
  originalRequest: string,
  generateRepair: (prompt: string, round: number) => Promise<string>,
  options: {
    charBudget?: number;
    onProgress?: (progress: WebRepairProgress) => void;
    canceled?: () => boolean;
  } = {},
): Promise<WebRepairResult> {
  let reply = initialReply;
  let repairs = 0;
  let report: WebQualityReport | null = null;
  const emit = (phase: WebRepairPhase) => options.onProgress?.({phase,repairs,report});
  emit("checking");
  while (!options.canceled?.()) {
    const extraction = extractProposedFiles(reply, originalRequest);
    const html = extraction.files.find(file => /\.html$/i.test(file.path));
    if (!html || extraction.error) {
      emit("not-applicable");
      return {reply,repairs,report:null,phase:"not-applicable"};
    }
    report = inspectWebSource(html.content, originalRequest);
    if (report.passed) {
      emit("static-pass");
      return {reply,repairs,report,phase:"static-pass"};
    }
    if (repairs >= MAX_WEB_REPAIRS) {
      emit("failed");
      return {reply,repairs,report,phase:"failed"};
    }
    const prompt = buildRepairRequest(originalRequest,html.content,report,options.charBudget);
    repairs++;
    emit("repairing");
    reply = await generateRepair(prompt,repairs);
  }
  return {reply,repairs,report,phase:"failed"};
}

export function summarizeQuality(report: WebQualityReport | null): string {
  if (!report) return "No single-file HTML implementation could be inspected.";
  const failed = report.checks.filter(check => !check.passed);
  return failed.length === 0
    ? "Static source checks passed. Browser interactions have NOT been verified."
    : "Failed source checks:\n" + failed.map(check => "- " + check.label + ": " + check.detail).join("\n");
}
