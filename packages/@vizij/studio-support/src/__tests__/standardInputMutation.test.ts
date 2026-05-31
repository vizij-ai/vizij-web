import { describe, expect, it } from "vitest";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
} from "@vizij/utils";
import {
  planStandardInputCreation,
  planStandardInputUpdate,
  resolveUpdatedStandardInputId,
} from "../index";

describe("standard input mutation planning", () => {
  it("derives a new canonical id from a changed path", () => {
    expect(
      resolveUpdatedStandardInputId({
        currentId: "custom_new_driver_2",
        normalizedPath: "/gaze/left_right",
        existingIds: [],
      }),
    ).toBe(createStandardRigInputFromPath("/gaze/left_right").id);
  });

  it("adds a suffix when the canonical id for a new path is already in use", () => {
    expect(
      resolveUpdatedStandardInputId({
        currentId: "custom_new_driver_2",
        normalizedPath: "/gaze/left_right",
        existingIds: [createStandardRigInputFromPath("/gaze/left_right").id],
      }),
    ).toBe(`${createStandardRigInputFromPath("/gaze/left_right").id}_2`);
  });

  it("creates a unique custom input when a canonical id already exists", () => {
    const existing = createStandardRigInputFromPath("/gaze/left_right");
    const result = planStandardInputCreation({
      path: "/gaze/left_right",
      existingInputs: [existing],
    });

    expect(result.updatedInput).toMatchObject({
      id: `${existing.id}_2`,
      path: "/gaze/left_right_2",
      group: "gaze",
    });
  });

  it("rekeys inputs when the path changes", () => {
    const original = createStandardRigInput({
      id: "custom_new_driver_2",
      path: "/custom/new_driver_2",
      label: "Left Right",
      group: "custom",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    const result = planStandardInputUpdate({
      currentInput: original,
      updates: { path: "/gaze/left_right" },
      existingInputs: [original],
    });

    expect(result).toEqual({
      status: "updated",
      plan: expect.objectContaining({
        previousId: "custom_new_driver_2",
        nextId: createStandardRigInputFromPath("/gaze/left_right").id,
        pathChanged: true,
        updatedInput: expect.objectContaining({
          id: createStandardRigInputFromPath("/gaze/left_right").id,
          path: "/gaze/left_right",
          group: "gaze",
        }),
      }),
    });
  });

  it("rejects duplicate normalized paths", () => {
    const current = createStandardRigInputFromPath("/custom/source");
    const existing = createStandardRigInputFromPath("/gaze/left_right");
    const result = planStandardInputUpdate({
      currentInput: current,
      updates: { path: "gaze/left_right" },
      existingInputs: [current, existing],
    });

    expect(result).toEqual({
      status: "error",
      issue: {
        code: "duplicate-path",
        message:
          'Another standard input already uses the path "/gaze/left_right".',
        normalizedPath: "/gaze/left_right",
      },
    });
  });

  it("normalizes labels, source ids, ranges, and default values", () => {
    const current = createStandardRigInput({
      id: "controls_smile",
      path: "/controls/smile",
      label: "Smile",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
      sourceId: "source:old",
    });
    const result = planStandardInputUpdate({
      currentInput: current,
      updates: {
        label: " ",
        sourceId: " source:new ",
        defaultValue: 5,
        range: { min: 2, max: -2 },
      },
      existingInputs: [current],
    });

    expect(result).toEqual({
      status: "updated",
      plan: expect.objectContaining({
        updatedInput: expect.objectContaining({
          id: "controls_smile",
          label: "Controls Smile",
          sourceId: "source:new",
          defaultValue: 2,
          range: { min: -2, max: 2 },
        }),
      }),
    });
  });

  it("returns unchanged when a patch does not alter canonical input state", () => {
    const current = createStandardRigInputFromPath("/controls/smile");
    expect(
      planStandardInputUpdate({
        currentInput: current,
        updates: { path: current.path, label: current.label },
        existingInputs: [current],
      }),
    ).toEqual({ status: "unchanged" });
  });
});
