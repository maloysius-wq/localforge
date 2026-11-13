import { describe, expect, it } from "vitest";
import { extractProposedFiles, safeSourceDestination } from "./autoEdits";
const fence = String.fromCharCode(96).repeat(3);
describe("auto staging", () => {
  it("stages one HTML file for the reported Minesweeper task", () => {
    const reply=fence+"html\n<!doctype html><html><body><script>const mines=10;</script></body></html>\n"+fence;
    expect(extractProposedFiles(reply,"Turn New Text Document.txt into HTML Minesweeper").files[0].path).toBe("index.html");
  });
  it("supports explicit multi-file edits", () => {
    const reply="FILE: index.html\n"+fence+"html\n<html></html>\n"+fence+"\nFILE: src/main.js\n"+fence+"js\nconsole.log('hi');\n"+fence;
    expect(extractProposedFiles(reply,"Build a website").files.map(f=>f.path)).toEqual(["index.html","src/main.js"]);
  });
  it("refuses ambiguous blocks and duplicate filenames", () => {
    const reply=fence+"js\nconst a=1;\n"+fence+"\n"+fence+"css\nbody{}\n"+fence;
    expect(extractProposedFiles(reply,"Build web app").error).toContain("explicit filenames");
    const duplicate="FILE: index.html\n"+fence+"html\none\n"+fence+"\nFILE: INDEX.HTML\n"+fence+"html\ntwo\n"+fence;
    expect(extractProposedFiles(duplicate,"Build app").error).toContain("Duplicate");
  });
  it("rejects traversal, secrets, and absolute paths", () => {
    for (const path of ["../outside.py","/etc/passwd","src/.env","a/secret.py","C:/danger.js"]) {
      expect(safeSourceDestination(path)).toBe(false);
    }
  });
  it("does not attempt to edit from prose or an unfinished code block", () => {
    expect(extractProposedFiles("I can help build that","Build app").files).toHaveLength(0);
    expect(extractProposedFiles(fence+"html\n<html>","Build app").files).toHaveLength(0);
  });
});
