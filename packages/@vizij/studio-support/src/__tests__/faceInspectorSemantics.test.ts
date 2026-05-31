import { describe, expect, it } from "vitest";
import { resolveFaceInspectorCurrentValue } from "../utils/faceInspectorSemantics";

describe("face inspector channel semantics", () => {
  it("resolves current value from propsrig channel authority", () => {
    const resolved = resolveFaceInspectorCurrentValue({
      inputId: "propsrig-face-x",
      standardInput: {
        id: "propsrig-face-x",
        path: "/propsrig/face/translation/x",
        defaultValue: 0.1,
      } as any,
      unresolvedInputId: null,
      blockedReason: null,
      inputValues: { "propsrig-face-x": 0.42 },
      staticValue: -1,
    });

    expect(resolved.currentValue).toBe(0.42);
    expect(resolved.sourceKind).toBe("propsrig-channel");
    expect(resolved.sourceInputId).toBe("propsrig-face-x");
    expect(resolved.sourcePath).toBe("/propsrig/face/translation/x");
  });

  it("falls back to static value for unresolved channel authority", () => {
    const resolved = resolveFaceInspectorCurrentValue({
      inputId: "missing-channel",
      standardInput: null,
      unresolvedInputId: "missing-channel",
      blockedReason: null,
      inputValues: { "missing-channel": 0.99 },
      staticValue: 0.25,
    });

    expect(resolved.currentValue).toBe(0.25);
    expect(resolved.sourceKind).toBe("unresolved-channel");
    expect(resolved.unresolvedInputId).toBe("missing-channel");
  });
});
