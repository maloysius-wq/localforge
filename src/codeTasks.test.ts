import { describe, it, expect } from "vitest";
import { codeTaskFor, containsImplementation, retryForActualCode } from "./codeTasks";

const fence = String.fromCharCode(96).repeat(3);
describe("code-first intent routing", () => {
  it("routes the reported Minesweeper request into HTML code mode", () => {
    const task = codeTaskFor('Please turn "New Text Document.txt" into a basic minesweeper game, contained in a single HTML file.', []);
    expect(task?.target).toBe("html");
    expect(task?.request).toContain("minesweeper");
  });
  it("recovers the original task on a follow-up instead of reinforcing a refusal", () => {
    const history = [
      { role: "user", content: "Build an HTML minesweeper game" },
      { role: "assistant", content: "Sure, here's a basic game. I can expand it later." },
    ];
    const task = codeTaskFor("Write the code itself", history);
    expect(task?.request).toContain("Build an HTML minesweeper game");
    expect(task?.request).toContain("Write the code itself");
    expect(task?.request).not.toContain("I can expand it");
  });
  it("leaves ordinary explanation questions in chat mode", () => {
    expect(codeTaskFor("Explain what this JavaScript does", [])).toBeNull();
  });
  it("requires actual HTML and JavaScript rather than prose or an unclosed fragment", () => {
    const doc = '<!DOCTYPE html>\n<html><head><style>.board { display:grid; }</style></head><body><button>Restart</button><script>let count = 0; document.querySelector("button").onclick=()=>count++;</script></body></html>';
    expect(containsImplementation(fence + "html\n" + doc + "\n" + fence, "html")).toBe(true);
    expect(containsImplementation(doc, "html")).toBe(true);
    expect(containsImplementation("Sure, here's a basic Minesweeper game. I can expand it later.", "html")).toBe(false);
    expect(containsImplementation("Sorry, I can't assist with that request.", "html")).toBe(false);
    expect(containsImplementation(fence + "html\n<html><body><script>let x = 1</script>\n" + fence, "html")).toBe(false);
  });
  it("creates a narrowly scoped recovery request", () => {
    const task = codeTaskFor("Create a standalone HTML game", [])!;
    expect(retryForActualCode(task)).toContain("OUTPUT SOURCE CODE, NOT A DESCRIPTION");
  });
});
