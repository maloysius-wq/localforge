import { describe, expect, it } from "vitest";
import tauriConfig from "../src-tauri/tauri.conf.json";

describe("desktop launch", () => {
  it("opens a normal maximized window with the title bar available", () => {
    expect(tauriConfig.app.windows[0].maximized).toBe(true);
    expect(tauriConfig.app.windows[0].fullscreen).toBe(false);
  });
});
