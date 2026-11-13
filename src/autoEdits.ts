import { suggestFilename } from "./projectTools";

export type ProposedSourceFile = { path: string; content: string };
export type ParseProposals = { files: ProposedSourceFile[]; error: string | null };
const SOURCE_EXT = /\.(?:py|js|jsx|ts|tsx|html|css|json|rs|md|toml|yml|yaml|txt)$/i;

export function safeSourceDestination(path: string): boolean {
  if (!path || path.length > 240 || path.startsWith("/") || path.includes("\\") || path.includes(":")) return false;
  const parts = path.split("/");
  if (parts.some(p => !p || p === "." || p === ".." || p.startsWith(".") || /secret|credential|private_key/i.test(p))) return false;
  return SOURCE_EXT.test(path);
}

function findFileLabel(text: string): string | null {
  const lines = text.slice(-220).trimEnd().split("\n").slice(-3);
  for (const raw of lines.reverse()) {
    const line = raw.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim();
    const matched = line.match(/^(?:#{1,6}\s*)?(?:(?:file|filename|path)\s*:\s*)?[*\x60]*([a-zA-Z0-9_-][a-zA-Z0-9_./-]*\.(?:py|js|jsx|ts|tsx|html|css|json|rs|md|toml|yml|yaml|txt))[*\x60]*\s*:?\s*$/i);
    if (matched) return matched[1];
  }
  return null;
}

export function extractProposedFiles(reply: string, request: string): ParseProposals {
  const matches = [...reply.matchAll(/(?:^|\n)\x60{3}([^\r\n\x60]*)\r?\n([\s\S]*?)\r?\n\x60{3}(?=\n|$)/g)];
  if (!matches.length) {
    if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(reply) && /<\/html>\s*$/i.test(reply))
      return { files: [{ path: suggestFilename("html", request), content: reply.trim() }], error: null };
    return { files: [], error: null };
  }
  if (matches.length > 8) return { files: [], error: "More than eight files were proposed. Split the request." };
  const files: ProposedSourceFile[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const descriptor = match[1].trim();
    const language = descriptor.split(/\s+/)[0];
    const explicit = findFileLabel(reply.slice(0,match.index ?? 0))
      || descriptor.split(/\s+/).slice(1).find(s => SOURCE_EXT.test(s))
      || (SOURCE_EXT.test(language) ? language : null);
    if (matches.length > 1 && !explicit) {
      return { files: [], error: "Multiple code blocks need explicit filenames such as FILE: index.html." };
    }
    const path = explicit ?? suggestFilename(language, request);
    if (!safeSourceDestination(path)) return { files: [], error: "Invalid or restricted source path: " + path };
    if (seen.has(path.toLowerCase())) return { files: [], error: "Duplicate file destination: " + path };
    const code = match[2].trim();
    if (!code) return { files: [], error: "The model generated an empty source file." };
    seen.add(path.toLowerCase());
    files.push({ path, content: code });
  }
  return { files, error: null };
}
