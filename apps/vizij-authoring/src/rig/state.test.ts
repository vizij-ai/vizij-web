import { describe, expect, it } from "vitest";

import {
  createDefaultBinding,
  createDefaultRemap,
  reconcileBindings,
  updateBindingSlotAlias,
  addBindingSlot,
  buildCanonicalBindingExpression,
  type BindingMap,
} from "@vizij/node-graph-authoring";
import type { AnimatableComponent } from "@vizij/utils";

const COMPONENT: AnimatableComponent = {
  id: "jaw_open",
  safeId: "jaw_open",
  animatableId: "jaw_open",
  animatableType: "number",
  label: "Jaw Open",
  defaultValue: 0,
  range: {
    min: -1,
    max: 1,
  },
};

describe("reconcileBindings", () => {
  it("preserves custom output remap values", () => {
    const base = createDefaultBinding(COMPONENT);
    const customRemap = {
      inLow: -2,
      inAnchor: 0.5,
      inHigh: 2,
      outLow: -0.25,
      outAnchor: 0.75,
      outHigh: 1.5,
    };
    const bindings: BindingMap = {
      [COMPONENT.id]: {
        ...base,
        inputId: "standard/jaw_open",
        remap: { ...customRemap },
        slots: [
          {
            ...base.slots[0],
            inputId: "standard/jaw_open",
            remap: { ...customRemap },
          },
        ],
      },
    };

    const result = reconcileBindings(bindings, [COMPONENT]);
    const remap = result[COMPONENT.id]?.remap;

    expect(remap).toBeDefined();
    expect(remap?.outLow).toBeCloseTo(-0.25);
    expect(remap?.outAnchor).toBeCloseTo(0.75);
    expect(remap?.outHigh).toBeCloseTo(1.5);
  });

  it("fills missing outputs with defaults and clamps anchor between the range", () => {
    const defaults = createDefaultRemap(COMPONENT);
    const base = createDefaultBinding(COMPONENT);
    const bindings: BindingMap = {
      [COMPONENT.id]: {
        ...base,
        inputId: "standard/jaw_open",
        remap: {
          ...defaults,
          outLow: Number.NaN,
          outAnchor: 5,
          outHigh: -0.25,
        },
        slots: [
          {
            ...base.slots[0],
            inputId: "standard/jaw_open",
            remap: {
              ...defaults,
              outLow: Number.NaN,
              outAnchor: 5,
              outHigh: -0.25,
            },
          },
        ],
      },
    };

    const result = reconcileBindings(bindings, [COMPONENT]);
    const remap = result[COMPONENT.id]?.remap;

    expect(remap).toBeDefined();
    expect(remap?.outLow).toBeCloseTo(COMPONENT.range.min);
    expect(remap?.outHigh).toBeCloseTo(-0.25);
    expect(remap?.outAnchor).toBeGreaterThanOrEqual(remap?.outLow ?? 0);
    expect(remap?.outAnchor).toBeLessThanOrEqual(remap?.outHigh ?? 0);
  });

  it("normalizes legacy slot identifiers and expressions", () => {
    const base = createDefaultBinding(COMPONENT);
    const next = addBindingSlot(base, COMPONENT);
    const bindings: BindingMap = {
      [COMPONENT.id]: {
        ...next,
        expression: "slot_1 + slot_2",
      },
    };

    const result = reconcileBindings(bindings, [COMPONENT]);
    const normalized = result[COMPONENT.id];

    expect(normalized).toBeDefined();
    expect(normalized?.slots[0]?.id).toBe("s1");
    expect(normalized?.slots[0]?.alias).toBe("s1");
    expect(normalized?.slots[1]?.id).toBe("s2");
    expect(normalized?.slots[1]?.alias).toBe("s2");
    expect(normalized?.expression).toBe("s1 + s2");
  });

  it("updates slot aliases and rewrites expressions", () => {
    const base = addBindingSlot(createDefaultBinding(COMPONENT), COMPONENT);
    base.expression = "s1 + s2";
    const updated = updateBindingSlotAlias(base, COMPONENT, "s2", "Upper Lip");
    expect(updated.slots[1]?.alias).toBe("Upper_Lip");
    expect(updated.expression).toBe(buildCanonicalBindingExpression(updated));
  });

  it("ensures alias uniqueness when duplicates are requested", () => {
    const base = addBindingSlot(createDefaultBinding(COMPONENT), COMPONENT);
    const first = updateBindingSlotAlias(base, COMPONENT, "s1", "driver");
    const second = updateBindingSlotAlias(first, COMPONENT, "s2", "driver");
    expect(second.slots[0]?.alias).toBe("driver");
    expect(second.slots[1]?.alias).toBe("driver_2");
  });
});
