import { describe, expect, it } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import {
  ensureStandardPathInput,
  inferStandardSuggestion,
} from "../standardInputPaths";

describe("standardInputPaths", () => {
  const standardInputs: StandardRigInput[] = [
    {
      id: "eyes.blink",
      label: "Blink",
      path: "/standard/eyes/blink",
      defaultValue: 0,
      range: { min: 0, max: 1 },
      group: "eyes",
    },
  ];

  it("normalizes rig paths to standard paths", () => {
    expect(ensureStandardPathInput("rig/face/eyes/blink")).toBe(
      "/standard/eyes/blink",
    );
    expect(ensureStandardPathInput("/standard/eyes/blink")).toBe(
      "/standard/eyes/blink",
    );
  });

  it("suggests matching standard inputs from rig paths", () => {
    const suggestion = inferStandardSuggestion(
      "rig/robot/eyes/blink",
      standardInputs,
    );
    expect(suggestion).toBe("/standard/eyes/blink");
  });

  it("returns a normalized fallback for unmatched rig paths", () => {
    expect(
      inferStandardSuggestion("rig/robot/eyes/smile", standardInputs),
    ).toBe("/standard/eyes/smile");
  });
});
