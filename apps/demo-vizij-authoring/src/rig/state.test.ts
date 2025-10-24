import { describe, expect, it } from "vitest";

import {
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
    const bindings: BindingMap = {
      [COMPONENT.id]: {
        targetId: COMPONENT.id,
        inputId: "standard/jaw_open",
        remap: {
          inLow: -2,
          inAnchor: 0.5,
          inHigh: 2,
          outLow: -0.25,
          outAnchor: 0.75,
          outHigh: 1.5,
        },
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
    const bindings: BindingMap = {
      [COMPONENT.id]: {
        targetId: COMPONENT.id,
        inputId: "standard/jaw_open",
        remap: {
          ...defaults,
          outLow: Number.NaN,
          outAnchor: 5,
          outHigh: -0.25,
        },
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
});
