import { describe, expect, it } from "vitest";
import {
  appendStandardInputPathSuffix,
  remapBindingDefinition,
  remapStandardInputValues,
} from "../index";

describe("standard input remap application", () => {
  it("appends duplicate suffixes to the leaf path segment", () => {
    expect(appendStandardInputPathSuffix("/gaze/up", "_copy")).toBe(
      "/gaze/up_copy",
    );
    expect(
      appendStandardInputPathSuffix("/rig/face/head/rotation/x", "_copy"),
    ).toBe("/rig/face/head/rotation/x_copy");
  });

  it("preserves standard input values when no ids change", () => {
    const values = { smile: 0.5 };

    expect(remapStandardInputValues(values, new Map())).toBe(values);
  });

  it("remaps binding definitions and nested pipeline metadata", () => {
    const remapped = remapBindingDefinition(
      {
        inputId: "old_parent",
        slots: [{ id: "s1", alias: "s1", inputId: "old_parent" }],
        expression: "s1",
        metadata: {
          vizij: {
            pipelineV1: {
              byInputId: {
                child: {
                  inputId: "child",
                  parents: [{ inputId: "old_parent", alias: "s1" }],
                },
              },
            },
          },
        },
      },
      new Map([["old_parent", "new_parent"]]),
    );

    expect(remapped.inputId).toBe("new_parent");
    expect(remapped.slots[0]?.inputId).toBe("new_parent");
    expect(
      (
        remapped.metadata as {
          vizij?: {
            pipelineV1?: {
              byInputId?: Record<string, { parents?: { inputId?: string }[] }>;
            };
          };
        }
      ).vizij?.pipelineV1?.byInputId?.child?.parents?.[0]?.inputId,
    ).toBe("new_parent");
  });
});
