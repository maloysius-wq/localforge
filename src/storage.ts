export type Theme = "dark" | "light";
export interface Project { id: string; name: string; path: string; addedAt: number }
export interface ChatMessage { id: string; role: "user" | "system"; content: string; createdAt: number }
export interface Thread { id: string; projectId: string | null; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[] }
export interface EventLog { id: string; message: string; at: number }
export interface WorkspaceState {
  version: 1;
  projects: Project[];
  threads: Thread[];
  activeThreadId: string | null;
  activeProjectId: string | null;
  theme: Theme;
  activity: EventLog[];
}
export const STORAGE_KEY = "localforge.workspace.v1";
export const blankState = (): WorkspaceState => ({
  version: 1, projects: [], threads: [], activeThreadId: null,
  activeProjectId: null, theme: "dark", activity: [],
});

// Local-only, no app telemetry or cloud sync. Reject unexpected data rather than executing it.
export function loadWorkspace(storage: Pick<Storage, "getItem"> = localStorage): WorkspaceState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return blankState();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return blankState();
    const data = value as Partial<WorkspaceState>;
    const projects = Array.isArray(data.projects)
      ? data.projects.filter((p): p is Project => !!p && typeof p.id === "string" && typeof p.name === "string" && typeof p.path === "string" && typeof p.addedAt === "number")
      : [];
    const projectIds = new Set(projects.map(p => p.id));
    const threads = Array.isArray(data.threads)
      ? data.threads.filter((t): t is Thread => !!t && typeof t.id === "string" && typeof t.title === "string" && typeof t.createdAt === "number" && typeof t.updatedAt === "number" && (t.projectId === null || typeof t.projectId === "string") && Array.isArray(t.messages))
        .map(t => ({ ...t, messages: t.messages.filter(m => m && typeof m.id === "string" && (m.role === "user" || m.role === "system") && typeof m.content === "string" && typeof m.createdAt === "number") }))
      : [];
    const threadIds = new Set(threads.map(t => t.id));
    return {
      version: 1, projects, threads,
      activeThreadId: typeof data.activeThreadId === "string" && threadIds.has(data.activeThreadId) ? data.activeThreadId : null,
      activeProjectId: typeof data.activeProjectId === "string" && projectIds.has(data.activeProjectId) ? data.activeProjectId : null,
      theme: data.theme === "light" ? "light" : "dark",
      activity: Array.isArray(data.activity) ? data.activity.filter((e): e is EventLog => !!e && typeof e.id === "string" && typeof e.message === "string" && typeof e.at === "number").slice(0, 40) : [],
    };
  } catch {
    return blankState();
  }
}

export function saveWorkspace(state: WorkspaceState, storage: Pick<Storage, "setItem"> = localStorage): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function uniqueProject(state: WorkspaceState, path: string): boolean {
  const normalized = path.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  return !state.projects.some(p => p.path.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase() === normalized);
}

export function projectLabel(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || path;
}

export function newId(): string { return crypto.randomUUID(); }
