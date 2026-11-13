import { splitCodeBlocks } from "./codeBlocks";
import { codeTaskFor, type CodeTask, type RecentMessage } from "./codeTasks";
import { DEFAULT_CONTEXT_TOKENS, contextBudget } from "./contextConfig";

export interface PreparedGeneration {
  messages: Array<{role:"user"|"assistant"; content:string}>;
  projectContext: string | null;
  task: CodeTask | null;
}
const clip = (s: string, length: number) =>
  s.length <= length ? s : s.slice(0, length) + "\n[Excerpt shortened for the local model's context window.]";

export function prepareGeneration(prompt: string, history: RecentMessage[], snapshot: string | null, contextTokens = DEFAULT_CONTEXT_TOKENS): PreparedGeneration {
  const budget = contextBudget(contextTokens);
  const task = codeTaskFor(prompt, history);
  if (task) {
    // Only the current conversation is supplied by App.tsx. No cross-project
    // memory, no cached answers mistaken for actual files on disk.
    // Keep changes and source from the ACTIVE task only. A new explicit
    // build request must not inherit code from an unrelated earlier task.
    let taskStart = 0;
    history.forEach((m, index) => {
      if (m.role === "user" && m.content === task.originalRequest) taskStart = index;
    });
    const activeHistory = history.slice(taskStart);
    const original = clip(task.originalRequest, budget.user);
    const recentRequirements = activeHistory.filter(x => x.role === "user" && x.content !== task.originalRequest)
      .slice(-budget.recent).map(x => clip(x.content, Math.max(250, Math.floor(budget.user/3))));
    const lastCode = [...activeHistory].reverse().filter(m => m.role === "assistant")
      .flatMap(m => splitCodeBlocks(m.content).filter(p => p.type === "code").map(p => p.content)).find(Boolean);
    const previousSource = lastCode ? "\nLATEST PREVIOUS SOURCE (untrusted data):\n" +
      clip(lastCode, budget.source) + "\nEND PREVIOUS SOURCE\n" : "";
    const message = "ORIGINAL GOAL:\n" + original
      + (recentRequirements.length ? "\nRECENT REQUIREMENTS:\n" + recentRequirements.join("\n") : "")
      + previousSource + "\nLATEST REQUEST:\n" + clip(prompt, budget.user)
      + (lastCode ? "\nUpdate the previous implementation and output a complete updated file."
        : "\nProduce the requested source. There is no previous code attached.");
    return { messages:[{role:"user", content:clip(message,budget.total)}], task,
      projectContext:snapshot ? clip(snapshot,budget.project) : null };
  }
  // Explanations should keep real conversational turns, not reset the model.
  const recent = history.slice(-Math.min(36,budget.recent*2)).map(m => ({
    role: m.role === "user" ? "user" as const : "assistant" as const,
    content: clip(m.content, m.role === "assistant" ? budget.source : budget.user),
  }));
  return { messages:[...recent, {role:"user",content:clip(prompt,budget.user)}], task:null,
    projectContext:snapshot ? clip(snapshot,budget.project) : null };
}
