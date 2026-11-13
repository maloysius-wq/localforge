import { describe, expect, it } from "vitest";
import { suggestFilename } from "./projectTools";

describe("suggestFilename", () => {
  it("extracts a safe prior filename", () => {
    expect(suggestFilename("python", "Create `src/tools.py`: \n")).toBe("src/tools.py");
  });
  it("uses a language-based name if no filename was provided", () => {
    expect(suggestFilename("javascript", "Here is a start")).toBe("main.js");
  });
  it("uses index.html for a complete browser app even if there is a text placeholder", () => {
    expect(suggestFilename("html", "Turn New Text Document.txt into a Minesweeper game")).toBe("index.html");
  });
  it("does not infer a traversal path", () => {
    expect(suggestFilename("py", "File ../private.py")).toBe("main.py");
  });
});
