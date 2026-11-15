import { invoke } from "@tauri-apps/api/core";
import { blankState, loadWorkspace, type WorkspaceState } from "./storage";

/** The v1 WebView key is read only for the first native SQLite import. */
export async function initializeNativeWorkspace(legacyJson: string | null): Promise<WorkspaceState> {
  const raw = await invoke<string>("initialize_native_workspace", {
    legacyJson: legacyJson ?? JSON.stringify(blankState()),
  });
  // A failed database read must stop startup, not silently replace chat history.
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object"
    || (parsed as { version?: unknown }).version !== 1
    || !Array.isArray((parsed as {threads?: unknown}).threads)
    || !Array.isArray((parsed as {projects?: unknown}).projects)) {
    throw Error("Native workspace contains incompatible data. No changes were saved.");
  }
  return loadWorkspace({ getItem: () => raw });
}

/** Serialize complete snapshots so an older async save cannot overwrite a newer one. */
export function createWorkspaceWriteQueue(write: (json: string) => Promise<void>) {
  let tail: Promise<void> = Promise.resolve();
  return (workspace: WorkspaceState): Promise<void> => {
    const json = JSON.stringify(workspace);
    const saved = tail.then(() => write(json));
    tail = saved.catch(() => { /* Report each failed save, but allow later retries. */ });
    return saved;
  };
}

export const saveNativeWorkspace = createWorkspaceWriteQueue(
  snapshotJson => invoke<void>("save_native_workspace", { snapshotJson }),
);
