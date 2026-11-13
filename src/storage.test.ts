import { describe, expect, it } from "vitest";
import { blankState, loadWorkspace, projectLabel, saveWorkspace, uniqueProject, STORAGE_KEY } from "./storage";

describe("workspace persistence", () => {
  it("starts empty", () => expect(loadWorkspace({ getItem: () => null })).toEqual(blankState()));
  it("round-trips a workspace", () => {
    let raw: string | null = null;
    const state = { ...blankState(), theme: "light" as const };
    expect(saveWorkspace(state, { setItem: (key, data) => { expect(key).toBe(STORAGE_KEY); raw = data; } })).toBe(true);
    expect(loadWorkspace({ getItem: () => raw })).toEqual(state);
  });
  it("preserves model replies across restarts", () => {
    const state = blankState();
    state.threads.push({ id: "t", title: "Coder", projectId: null, createdAt: 1, updatedAt: 2,
      messages: [{ id: "u", role: "user", content: "Create a function", createdAt: 1 },
        { id: "a", role: "assistant", content: "def answer(): return 42", createdAt: 2 }] });
    let saved = "";
    saveWorkspace(state, { setItem: (_key, value) => { saved = value; } });
    expect(loadWorkspace({ getItem: () => saved }).threads[0].messages[1].role).toBe("assistant");
  });
  it("rejects invalid documents", () => expect(loadWorkspace({ getItem: () => "{not-json" })).toEqual(blankState()));
  it("handles absent storage without throwing", () => expect(saveWorkspace(blankState(), { setItem: () => { throw Error("quota"); } })).toBe(false));
  it("ignores repeated paths across separator and case differences", () => {
    const state = { ...blankState(), projects: [{ id: "1", name: "My App", path: "C:\\Work\\MyApp", addedAt: 1 }] };
    expect(uniqueProject(state, "c:/work/myapp/")).toBe(false);
    expect(uniqueProject(state, "c:/work/another")).toBe(true);
  });
  it("extracts a folder label from Windows or Linux paths", () => {
    expect(projectLabel("C:\\apps\\test")).toBe("test");
    expect(projectLabel("/home/user/website/")).toBe("website");
  });
});
