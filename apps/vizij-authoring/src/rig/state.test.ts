import { describe, expect, it } from "vitest";

import {
  createDefaultBinding,
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
