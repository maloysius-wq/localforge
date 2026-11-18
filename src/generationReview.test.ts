import { describe, expect, it } from "vitest";
import { reviewGeneration, type GenerationMetadata } from "./generationReview";
const meta: GenerationMetadata = { finishReason:"stop", promptTokens:200, completionTokens:800,
  outputLimit:4096, visibleChars:2500, reasoningChunks:7, sseEvents:800, malformedSse:0,
  doneMarker:true, durationMs:9000, firstVisibleMs:3000 };
describe("generation diagnostics classification", () => {
  it("rejects exhausted output limits despite plenty of code", () => {
    const v=reviewGeneration("```python\nprint('x')\n```", {...meta,finishReason:"length",completionTokens:4096},true,true,false);
    expect(v.outcome).toBe("rejected_output_limit");
    expect(v.accepted).toBe(false);
    expect(v.warning).toContain("4096");
  });
  it("rejects abruptly ended streams", () => {
    expect(reviewGeneration("<html>ready</html>",{...meta,doneMarker:false},true,true,false).outcome)
      .toBe("rejected_incomplete_stream");
  });
  it("recognizes a truncated fenced source block", () => {
    const x=reviewGeneration("```python\ndef thing():\n  print(1)",meta,true,true,false);
    expect(x.outcome).toBe("rejected_unclosed_fence");
    expect(x.closedFences).toBe(false);
  });
  it("separates real implementation and static-check failures", () => {
    const code="```python\nprint('hi')\n```";
    expect(reviewGeneration(code,meta,true,true,false).accepted).toBe(true);
    expect(reviewGeneration(code,meta,true,true,true).outcome).toBe("rejected_static_checks");
    expect(reviewGeneration("explanation only",meta,true,false,false).outcome).toBe("rejected_no_implementation");
  });
  it("does not persist code in diagnostic classification output", () => {
    const secret="SENSITIVE_SOURCE_BODY";
    const a=reviewGeneration(secret,{...meta,finishReason:"length"},true,false,false);
    expect(JSON.stringify(a)).not.toContain(secret);
  });
});
