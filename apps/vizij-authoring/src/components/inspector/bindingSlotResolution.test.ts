import { describe, expect, it } from "vitest";
import { SELF_BINDING_ID } from "@vizij/utils";
import { createStandardRigInput } from "@vizij/utils";
import {
  resolveEffectiveBindingInputId,
  resolveEffectiveBindingStandardInput,
} from "./bindingSlotResolution";

describe("resolveEffectiveBindingInputId", () => {
  it("returns null when binding is missing", () => {
    expect(resolveEffectiveBindingInputId(undefined)).toBeNull();
    expect(resolveEffectiveBindingInputId(null)).toBeNull();
  });

  it("returns the first non-self slot input", () => {
    const inputId = resolveEffectiveBindingInputId({
      slots: [{ inputId: SELF_BINDING_ID }, { inputId: "rig/main/mouth/open" }],
    });
    expect(inputId).toBe("rig/main/mouth/open");
  });

  it("skips blank and self slots", () => {
    const inputId = resolveEffectiveBindingInputId({
      slots: [{ inputId: "  " }, { inputId: SELF_BINDING_ID }, { inputId: "" }],
      inputId: "fallback/input",
    });
    expect(inputId).toBe("fallback/input");
  });

  it("falls back to binding.inputId when slots are missing", () => {
    expect(
      resolveEffectiveBindingInputId({
        inputId: "rig/main/eyes/blink",
      }),
    ).toBe("rig/main/eyes/blink");
  });

  it("returns null when only self is available", () => {
    expect(
      resolveEffectiveBindingInputId({
        slots: [{ inputId: SELF_BINDING_ID }],
        inputId: SELF_BINDING_ID,
      }),
    ).toBeNull();
  });
});

describe("resolveEffectiveBindingStandardInput", () => {
  it("resolves direct input ids", () => {
    const standardInput = createStandardRigInput({
      id: "l_eye_scale_x",
      path: "/l_eye/scale/x",
      label: "L Eye Scale X",
      group: "l_eye",
      defaultValue: 1,
      range: { min: 0, max: 2 },
    });
    const result = resolveEffectiveBindingStandardInput(
      { inputId: "l_eye_scale_x" },
      new Map([[standardInput.id, standardInput]]),
      [standardInput],
    );
    expect(result.inputId).toBe("l_eye_scale_x");
    expect(result.input).toEqual(standardInput);
    expect(result.unresolvedInputId).toBeNull();
  });

  it("falls back by normalized path/id when slot input id is legacy-formatted", () => {
    const standardInput = createStandardRigInput({
      id: "l_eye_scale_x",
      path: "/l_eye/scale/x",
      label: "L Eye Scale X",
      group: "l_eye",
      defaultValue: 1,
      range: { min: 0, max: 2 },
    });
    const result = resolveEffectiveBindingStandardInput(
      { inputId: "/l/eye/scale/x" },
      new Map(),
      [standardInput],
    );
    expect(result.inputId).toBe("l_eye_scale_x");
    expect(result.input).toEqual(standardInput);
    expect(result.unresolvedInputId).toBeNull();
  });

  it("returns unresolved id when lookup fails", () => {
    const result = resolveEffectiveBindingStandardInput(
      { inputId: "legacy_missing_input" },
      new Map(),
      [],
    );
    expect(result.inputId).toBe("legacy_missing_input");
    expect(result.input).toBeNull();
    expect(result.unresolvedInputId).toBe("legacy_missing_input");
  });

  it("returns unresolved id when normalized fallback is ambiguous", () => {
    const first = createStandardRigInput({
      id: "jaw_open_a",
      path: "/Jaw/Open",
      label: "Jaw Open A",
      group: "jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const second = createStandardRigInput({
      id: "jaw_open_b",
      path: "/jaw/open",
      label: "Jaw Open B",
      group: "jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const result = resolveEffectiveBindingStandardInput(
      { inputId: "/jaw/open" },
      new Map(),
      [first, second],
    );
    expect(result.inputId).toBe("/jaw/open");
    expect(result.input).toBeNull();
    expect(result.unresolvedInputId).toBe("/jaw/open");
  });
});
