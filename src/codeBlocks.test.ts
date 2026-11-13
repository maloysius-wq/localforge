import { describe, it, expect } from "vitest";
import { splitCodeBlocks } from "./codeBlocks";

describe("coding response presentation", () => {
  it("extracts runnable Python code while preserving surrounding explanation", () => {
    const parts = splitCodeBlocks("Create main.py:\n```python\nprint('ready')\n```\nRun it with Python.");
    expect(parts).toEqual([
      { type: "text", content: "Create main.py:" },
      { type: "code", language: "python", content: "print('ready')" },
      { type: "text", content: "\nRun it with Python." },
    ]);
  });
  it("supports multiple fenced files and text-only messages", () => {
    expect(splitCodeBlocks("```html\n<h1>Hi</h1>\n```\n```css\nh1 {color:red}\n```").filter(p => p.type === "code")).toHaveLength(2);
    expect(splitCodeBlocks("No code here")).toEqual([{ type: "text", content: "No code here" }]);
  });
  it("never discards unfinished code fences", () => {
    expect(splitCodeBlocks("```python\nprint('unfinished')")).toEqual([{ type: "text", content: "```python\nprint('unfinished')" }]);
  });
});

import { describe as describeRaw, it as itRaw, expect as expectRaw } from "vitest";
describeRaw("raw HTML rendering", () => {
  itRaw("renders a complete HTML document as a code block", () => {
    const html = '<!DOCTYPE html><html><head></head><body><script>let x=1;</script></body></html>';
    expectRaw(splitCodeBlocks(html)).toEqual([{type:"code",content:html,language:"html"}]);
  });
});
