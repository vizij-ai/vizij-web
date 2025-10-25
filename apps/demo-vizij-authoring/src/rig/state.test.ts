import { describe, expect, it } from "vitest";

import {
  createDefaultBinding,
  createDefaultRemap,
  reconcileBindings,
  type BindingMap,
} from "./state";
import type { AnimatableComponent } from "@vizij/utils";

const COMPONENT: AnimatableComponent = {
  id: "jaw_open",
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
    const bindings: BindingMap = {
      [COMPONENT.id]: {
        ...base,
        expression: "slot_1 + slot_2",
        slots: [
          {
            ...base.slots[0],
            id: "slot_1",
            alias: "slot_1",
          },
          {
            id: "slot_2",
            alias: "slot_2",
            inputId: null,
            remap: { ...createDefaultRemap(COMPONENT) },
          },
        ],
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
});
