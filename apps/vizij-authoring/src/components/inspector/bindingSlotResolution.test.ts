import { describe, expect, it } from "vitest";
import { SELF_BINDING_ID, createStandardRigInput } from "@vizij/utils";
import {
  resolveControllableInputId,
  resolveEffectiveControllableBindingStandardInput,
} from "./bindingSlotResolution";

describe("binding slot UI resolution", () => {
  it("formats multi-parent repair guidance locally", () => {
    const result = resolveControllableInputId("jaw_open", {
      jaw_open: {
        slots: [{ inputId: "left_parent" }, { inputId: "right_parent" }],
      },
    });

    expect(result.inputId).toBeNull();
    expect(result.blockedReason).toContain("multiple parent drivers");
    expect(result.blockedReason).toContain("Parents section");
  });

  it("preserves support resolution while translating blocked codes", () => {
    const derived = createStandardRigInput({
      id: "jaw_open",
      path: "/jaw/open",
      label: "Jaw Open",
      group: "jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });

    const result = resolveEffectiveControllableBindingStandardInput(
      { inputId: "jaw_open" },
      new Map([[derived.id, derived]]),
      [derived],
      {
        jaw_open: {
          inputId: SELF_BINDING_ID,
          slots: [{ inputId: SELF_BINDING_ID }],
        },
      },
    );

    expect(result.inputId).toBe("jaw_open");
    expect(result.input).toEqual(derived);
    expect(result.blockedReason).toBeNull();
  });
});
