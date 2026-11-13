export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language: string };

// Present code without interpreting model-supplied HTML or running scripts.
// A language tag is optional; unclosed fences remain ordinary text.
export function splitCodeBlocks(input: string): MessageSegment[] {
  const parts: MessageSegment[] = [];
  const fence = /(?:^|\n)```([^\r\n`]*)\r?\n([\s\S]*?)\r?\n```(?=\n|$)/g;
  let cursor = 0;
  for (const match of input.matchAll(fence)) {
    const start = match.index;
    if (start > cursor) parts.push({ type: "text", content: input.slice(cursor, start) });
    const language = match[1].trim().split(/\s+/)[0].slice(0, 36);
    parts.push({ type: "code", content: match[2], language });
    cursor = start + match[0].length;
  }
  if (cursor < input.length) parts.push({ type: "text", content: input.slice(cursor) });
  return parts.length ? parts : [{ type: "text", content: input }];
}
