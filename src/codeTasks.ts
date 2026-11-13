export type CodeTarget = "html" | "python" | "generic";
export type RecentMessage = { role: string; content: string };
export type CodeTask = { target: CodeTarget; request: string; originalRequest: string };

const creation = /\b(build|create|make|turn|convert|implement|generate|write|develop|code|finish|complete|expand)\b/i;
const artifact = /\b(game|app|application|program|html|css|javascript|typescript|python|script|website|page|file|feature|code|function|project|minesweeper|calculator)\b/i;
const continuation = /^(?:please\s+)?(?:expand(?:\s+it)?|finish(?:\s+it)?|complete(?:\s+it)?|write\s+(?:the\s+)?code|code\s+it|do\s+it|actually\s+(?:write|build|code)|make\s+it\s+(?:work|complete)|implement\s+it|add\b|change\b|modify\b|fix\b|improve\b|update\b|remove\b|refactor\b|adjust\b|tweak\b|now\b|make\b|set\b)/i;

function looksLikeBuildRequest(prompt: string): boolean {
  return creation.test(prompt) && artifact.test(prompt);
}

export function codeTaskFor(prompt: string, history: RecentMessage[]): CodeTask | null {
  const full = prompt.trim();
  const isNewBuild = looksLikeBuildRequest(full);
  const isFollowup = continuation.test(full);
  if (!isNewBuild && !isFollowup) return null;
  const earlier = history.find(msg => msg.role === "user" && looksLikeBuildRequest(msg.content));
  // Do not feed a previous model refusal back into the code-building prompt.
  const original = isFollowup && earlier ? earlier.content : full;
  if (!isNewBuild && !earlier) return null;
  const request = original === full ? full
    : "Original software task:\n" + original + "\n\nCurrent change:\n" + full + "\n\nUpdate the existing implementation and keep previous requirements.";
  const src = (original + " " + full).toLowerCase();
  const target: CodeTarget = /\b(html|webpage|website|single.file|browser|javascript|css)\b/.test(src) ? "html"
    : /\b(python|tkinter|\.py\b)\b/.test(src) ? "python" : "generic";
  return { target, request, originalRequest: original };
}

export function containsImplementation(reply: string, target: CodeTarget): boolean {
  const fences = [...reply.matchAll(/(?:^|\n)\x60{3}[^\r\n\x60]*\r?\n([\s\S]*?)\r?\n\x60{3}(?=\n|$)/g)].map(m => m[1]);
  if (target === "html" && /^\s*(?:<!doctype\s+html|<html\b)/i.test(reply)) fences.push(reply);
  return fences.some(source => {
    if (source.length < 80) return false;
    if (target === "html") {
      return /<html\b/i.test(source) && /<\/html\s*>/i.test(source)
        && /<script\b/i.test(source) && /<\/script\s*>/i.test(source);
    }
    if (target === "python") return /\b(def |class |import |from |if __name__|tkinter|print\()/i.test(source);
    return /[{}();=]|\b(def |class |import |function |return )/.test(source);
  });
}

export function retryForActualCode(task: CodeTask): string {
  const opening = task.target === "html" ? "an html fenced source-code block"
    : task.target === "python" ? "a python fenced source-code block" : "a fenced source-code block";
  return "IMPLEMENT THE SOFTWARE. OUTPUT SOURCE CODE, NOT A DESCRIPTION.\n\n"
    + task.request + "\n\nYour previous attempt did not include a complete usable source-code block. "
    + "Start your reply with " + opening + ". Return the smallest complete working implementation now, "
    + "with actual functions and event handlers. Don't offer to expand later or describe what you would write. "
    + "Do not claim it has been saved or tested.";
}
