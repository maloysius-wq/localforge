import { describe, expect, it } from "vitest";
import { prepareGeneration } from "./conversationContext";

const ticks = String.fromCharCode(96).repeat(3);
const game = "<!DOCTYPE html><html><body><script>let mines = 10;\n" +
  "let cells = [];\n".repeat(80) + "</script></body></html>";
const initial = {role:"user",content:"Build a single-file HTML Minesweeper game"};
const answer = {role:"assistant",content:ticks + "html\n" + game + "\n" + ticks};

describe("retained coding context", () => {
  it("keeps source and original user goal for an add-flags follow-up", () => {
    const result = prepareGeneration("Add right-click flags to the game", [initial,answer], "New Text Document.txt");
    expect(result.task?.target).toBe("html");
    expect(result.messages[0].content).toContain("Build a single-file HTML Minesweeper game");
    expect(result.messages[0].content).toContain("let mines = 10");
    expect(result.messages[0].content).toContain("Add right-click flags");
    expect(result.projectContext).toContain("New Text Document.txt");
  });
  it("handles polite follow-ups in the same project", () => {
    const r = prepareGeneration("Can you add a flag counter?",[initial,answer],null);
    expect(r.task).not.toBeNull();
    expect(r.messages[0].content).toContain("let mines = 10");
    expect(r.messages[0].content).toContain("flag counter");
  });
  it("handles a new explicit build as a new task anchor", () => {
    const history = [initial,answer,{role:"user",content:"Build a Python calculator"}];
    const r = prepareGeneration("Change the buttons",history,null);
    expect(r.messages[0].content).toContain("Build a Python calculator");
    expect(r.messages[0].content).not.toContain("ORIGINAL GOAL:\nBuild a single-file HTML Minesweeper game");
    expect(r.messages[0].content).not.toContain("let mines = 10");
  });
  it("recognizes Make a new game as the original goal, not a followup", () => {
    const original = {role:"user",content:"Make a new Minesweeper game in HTML"};
    const r = prepareGeneration("Add flags", [original,answer], null);
    expect(r.task?.originalRequest).toBe("Make a new Minesweeper game in HTML");
  });
  it("keeps subsequent user design choices and latest version of code", () => {
    const newAnswer = {role:"assistant",content:ticks + "html\n" + game.replace("mines = 10","mines = 20") + "\n" + ticks};
    const result = prepareGeneration("Make the colors purple",
      [initial,answer,{role:"user",content:"Add a 12x12 board"},newAnswer],null);
    expect(result.messages[0].content).toContain("Add a 12x12 board");
    expect(result.messages[0].content).toContain("mines = 20");
    expect(result.messages[0].content).not.toContain("mines = 10");
  });
  it("keeps prior assistant text for non-build conversation", () => {
    const result = prepareGeneration("Why are arrays used?",[initial,answer],null);
    expect(result.task).toBeNull();
    expect(result.messages.some(m => m.role === "assistant" && m.content.includes("let mines"))).toBe(true);
  });
  it("never includes another chat thread's history", () => {
    const result = prepareGeneration("Build a Python calculator",[],null);
    expect(result.messages[0].content).not.toContain("Minesweeper");
  });
  it("64K retains a larger previous implementation", () => {
    const code = "<!DOCTYPE html><html><body><script>" +
      "let cells = [];\n".repeat(2500) + "</script></body></html>";
    const previous = {role:"assistant",content:ticks+"html\n"+code+"\n"+ticks};
    const small = prepareGeneration("Add flags",[initial,previous],null,6144);
    const large = prepareGeneration("Add flags",[initial,previous],null,65536);
    expect(small.messages[0].content).toContain("Excerpt shortened");
    expect(large.messages[0].content.length).toBeGreaterThan(small.messages[0].content.length*4);
    expect(large.messages[0].content).toContain("</html>");
  });
  it("caps large source to the available CPU context budget", () => {
    const huge={role:"assistant",content:ticks+"html\n"+"<html>"+("a".repeat(20000))+"</html>\n"+ticks};
    const r=prepareGeneration("Improve the game",[initial,huge],"some project");
    expect(r.messages[0].content.length).toBeLessThan(7901);
    expect(r.messages[0].content).toContain("Excerpt shortened");
  });
});
