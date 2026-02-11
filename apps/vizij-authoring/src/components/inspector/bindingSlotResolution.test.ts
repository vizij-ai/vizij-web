import { describe, expect, it } from "vitest";
import { SELF_BINDING_ID } from "@vizij/utils";
import { resolveEffectiveBindingInputId } from "./bindingSlotResolution";

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
