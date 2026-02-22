import { describe, expect, it } from "vitest";
import { SELF_BINDING_ID, createStandardRigInput } from "@vizij/utils";
import type { RigBindingDefinition } from "@vizij/utils";
import { resolvePendingInputBindings } from "../pendingInputBindings";

describe("resolvePendingInputBindings", () => {
  it("returns null when there are no pending definitions", () => {
    const inputsById = new Map([
      [
        "mouth_smile",
        createStandardRigInput({
          path: "/standard/mouth/smile",
          label: "Smile",
          group: "Mouth",
          defaultValue: 0,
          range: { min: 0, max: 1 },
        }),
      ],
    ]);

    expect(resolvePendingInputBindings(null, inputsById)).toBeNull();
  });

  it("keeps only bindings that target known inputs and have parent routes", () => {
    const smile = createStandardRigInput({
      path: "/standard/mouth/smile",
      label: "Smile",
      group: "Mouth",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const master = createStandardRigInput({
      path: "/standard/mouth/master",
      label: "Master",
      group: "Mouth",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const inputsById = new Map([
      [smile.id, smile],
      [master.id, master],
    ]);

    const pending: Record<string, RigBindingDefinition> = {
      [smile.id]: {
        inputId: master.id,
        expression: "s1",
        slots: [
          {
            id: "s1",
            alias: "master",
            inputId: master.id,
            valueType: "scalar",
          },
        ],
      },
      [master.id]: {
        inputId: SELF_BINDING_ID,
        expression: "self",
        slots: [],
      },
      missing_input: {
        inputId: master.id,
        expression: "s1",
        slots: [
          {
            id: "s1",
            alias: "master",
            inputId: master.id,
            valueType: "scalar",
          },
        ],
      },
    };

    const resolved = resolvePendingInputBindings(pending, inputsById);
    expect(resolved).toBeTruthy();
    expect(Object.keys(resolved ?? {})).toEqual([smile.id]);
    expect(resolved?.[smile.id]?.targetId).toBe(smile.id);
    expect(resolved?.[smile.id]?.inputId).toBe(master.id);
  });
});
