import { invoke } from "@tauri-apps/api/core";

export interface ProjectSnapshot { root: string; files: { path: string; bytes: number }[]; context: string; truncated: boolean }
export interface ProjectFile { path: string; exists: boolean; content: string; sha256: string | null }
export interface AppliedChange { token: string; path: string; sha256: string }
export const inspectProject = (root: string) => invoke<ProjectSnapshot>("inspect_project", { root });
export const readProjectFile = (root: string, path: string) => invoke<ProjectFile>("read_project_file", { root, path });
export const applyProjectChange = (root: string, path: string, expectedSha: string | null, content: string) =>
  invoke<AppliedChange>("apply_project_change", { root, path, expectedSha, content });
export const undoProjectChange = (root: string, token: string) => invoke<string>("undo_project_change", { root, token });

const supported = new Set(["py", "js", "jsx", "ts", "tsx", "html", "css", "json", "rs", "md", "toml", "yml", "yaml"]);
export function suggestFilename(language: string, precedingText: string): string {
  const match = Array.from(precedingText.matchAll(/(?:^|\n|\s|`)([\w./-]+\.(?:py|js|jsx|ts|tsx|html|css|json|rs|md|toml|yml|yaml))\b/gi)).at(-1);
  if (match && !match[1].includes("..") && !match[1].startsWith("/")) return match[1];
  const ext = language.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const normalized = ({ python: "py", javascript: "js", typescript: "ts", rust: "rs" } as Record<string, string>)[ext] || ext;
  return supported.has(normalized) ? `main.${normalized}` : "main.py";
}
