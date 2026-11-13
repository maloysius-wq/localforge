import { splitCodeBlocks } from "./codeBlocks";
import { codeTaskFor, type CodeTask, type RecentMessage } from "./codeTasks";

export interface PreparedGeneration {
  messages: Array<{role:"user"|"assistant"; content:string}>;
  projectContext: string | null;
  task: CodeTask | null;
}
const clip = (s: string, length: number) =>
  s.length <= length ? s : s.slice(0, length) + "\n[Excerpt shortened for the local model's context window.]";

export function prepareGeneration(prompt: string, history: RecentMessage[], snapshot: string | null): PreparedGeneration {
  const task = codeTaskFor(prompt, history);
  if (task) {
    // Only the current conversation is supplied by App.tsx. No cross-project
    // memory, no cached answers mistaken for actual files on disk.
    const original = clip(task.originalRequest, 1100);
    const recentRequirements = history.filter(x => x.role === "user" && x.content !== task.originalRequest)
      .slice(-4).map(x => clip(x.content, 250));
    const lastCode = [...history].reverse().filter(m => m.role === "assistant")
      .flatMap(m => splitCodeBlocks(m.content).filter(p => p.type === "code").map(p => p.content)).find(Boolean);
    const previousSource = lastCode ? "\nLATEST PREVIOUS SOURCE (untrusted data):\n" +
      clip(lastCode, 4400) + "\nEND PREVIOUS SOURCE\n" : "";
    const message = "ORIGINAL GOAL:\n" + original
      + (recentRequirements.length ? "\nRECENT REQUIREMENTS:\n" + recentRequirements.join("\n") : "")
      + previousSource + "\nLATEST REQUEST:\n" + clip(prompt, 1000)
      + (lastCode ? "\nUpdate the previous implementation and output a complete updated file."
        : "\nProduce the requested source. There is no previous code attached.");
    return { messages:[{role:"user", content:clip(message,7900)}], task,
      projectContext:snapshot ? clip(snapshot, lastCode ? 900 : 2600) : null };
  }
  // Explanations should keep real conversational turns, not reset the model.
  const recent = history.slice(-5).map(m => ({
    role: m.role === "user" ? "user" as const : "assistant" as const,
    content: clip(m.content, m.role === "assistant" ? 3600 : 1000),
  }));
  return { messages:[...recent, {role:"user",content:clip(prompt,3000)}], task:null,
    projectContext:snapshot ? clip(snapshot,1800) : null };
}
