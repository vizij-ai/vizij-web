import { describe, expect, it } from "vitest";
import { SELF_BINDING_ID } from "@vizij/utils";
import { createStandardRigInput } from "@vizij/utils";
import {
  resolveControllableInputId,
  resolveEffectiveControllableBindingStandardInput,
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

describe("resolveControllableInputId", () => {
  it("returns the same input when no parent binding exists", () => {
    expect(resolveControllableInputId("jaw_open", {})).toEqual({
      inputId: "jaw_open",
      blockedReason: null,
    });
  });

  it("walks upstream when current input has no self slot", () => {
    const result = resolveControllableInputId("jaw_open", {
      jaw_open: {
        inputId: "mouth_open",
        slots: [{ inputId: "mouth_open" }],
      },
      mouth_open: {
        inputId: SELF_BINDING_ID,
        slots: [{ inputId: SELF_BINDING_ID }],
      },
    });
    expect(result).toEqual({
      inputId: "mouth_open",
      blockedReason: null,
    });
  });

  it("returns blocked for multi-parent bindings without self", () => {
    const result = resolveControllableInputId("jaw_open", {
      jaw_open: {
        slots: [{ inputId: "left_parent" }, { inputId: "right_parent" }],
      },
    });
    expect(result.inputId).toBeNull();
    expect(result.blockedReason).toContain("multiple parent drivers");
  });
});

describe("resolveEffectiveControllableBindingStandardInput", () => {
  it("resolves to a controllable upstream input when direct input lacks self", () => {
    const upstream = createStandardRigInput({
      id: "mouth_open",
      path: "/mouth/open",
      label: "Mouth Open",
      group: "mouth",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const derived = createStandardRigInput({
      id: "jaw_open",
      path: "/jaw/open",
      label: "Jaw Open",
      group: "jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const resolved = resolveEffectiveControllableBindingStandardInput(
      { inputId: "jaw_open" },
      new Map([
        [upstream.id, upstream],
        [derived.id, derived],
      ]),
      [upstream, derived],
      {
        jaw_open: {
          inputId: "mouth_open",
          slots: [{ inputId: "mouth_open" }],
        },
        mouth_open: {
          inputId: SELF_BINDING_ID,
          slots: [{ inputId: SELF_BINDING_ID }],
        },
      },
    );
    expect(resolved.inputId).toBe("mouth_open");
    expect(resolved.input).toEqual(upstream);
    expect(resolved.unresolvedInputId).toBeNull();
    expect(resolved.blockedReason).toBeNull();
  });

  it("returns blocked reason for multi-parent non-self chains", () => {
    const derived = createStandardRigInput({
      id: "jaw_open",
      path: "/jaw/open",
      label: "Jaw Open",
      group: "jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    });
    const resolved = resolveEffectiveControllableBindingStandardInput(
      { inputId: "jaw_open" },
      new Map([[derived.id, derived]]),
      [derived],
      {
        jaw_open: {
          slots: [{ inputId: "left_parent" }, { inputId: "right_parent" }],
        },
      },
    );
    expect(resolved.inputId).toBe("jaw_open");
    expect(resolved.input).toEqual(derived);
    expect(resolved.unresolvedInputId).toBeNull();
    expect(resolved.blockedReason).toContain("multiple parent drivers");
  });
});
