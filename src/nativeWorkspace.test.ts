import { describe, expect, it } from "vitest";
import { blankState } from "./storage";
import { createWorkspaceWriteQueue } from "./nativeWorkspace";

describe("native workspace save queue", () => {
  it("never overwrites a newer snapshot with an older async completion", async () => {
    const finished: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const save = createWorkspaceWriteQueue(async json => {
      const data = JSON.parse(json);
      if (data.theme === "light") await gate;
      finished.push(data.theme);
    });
    const first = save({ ...blankState(), theme: "light" });
    const second = save({ ...blankState(), theme: "dark" });
    await Promise.resolve();
    expect(finished).toEqual([]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(finished).toEqual(["light", "dark"]);
  });
  it("reports failures while permitting a later successful save", async () => {
    const states: string[] = [];
    const save = createWorkspaceWriteQueue(async raw => {
      const theme = JSON.parse(raw).theme as string;
      if (theme === "light") throw Error("disk full");
      states.push(theme);
    });
    await expect(save({ ...blankState(), theme: "light" })).rejects.toThrow("disk full");
    await expect(save({ ...blankState(), theme: "dark" })).resolves.toBeUndefined();
    expect(states).toEqual(["dark"]);
  });
});
