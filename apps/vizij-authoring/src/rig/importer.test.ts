import { describe, expect, it } from "vitest";

import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";

import {
  buildRigGraphSpec,
  createDefaultBinding,
  createDefaultRemap,
} from "@vizij/node-graph-authoring";
import { rehydrateRigDataFromGraph } from "./importer";

const COMPONENT: AnimatableComponent = {
  id: "component_1",
  safeId: "component_1",
  animatableId: "rig/robot/mouth/pos/y",
  animatableType: "number",
  label: "Mouth Pos Y",
  defaultValue: 0,
  range: {
    min: -1,
    max: 1,
  },
};

const ANIMATABLE: AnimatableValue = {
  id: "rig/robot/mouth/pos/y",
  type: "number",
  name: "Mouth Pos Y",
  default: 0,
  constraints: {
    min: -1,
    max: 1,
  },
  pub: {
    public: true,
    output: "Mouth Pos Y",
  },
};

const INPUT_A: StandardRigInput = {
  id: "input_a",
  path: "/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

describe("importer operator persistence", () => {
  it("rehydrates operator settings from metadata summaries", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots[0] = {
      ...binding.slots[0],
      inputId: INPUT_A.id,
      remap: { ...createDefaultRemap(COMPONENT) },
    };
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    const slewOperator = binding.operators?.find(
      (operator) => operator.type === "slew",
    );
    if (slewOperator) {
      slewOperator.enabled = true;
      slewOperator.params.max_rate = 0.4;
    }

    const graph = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
      bindings: {
        [COMPONENT.id]: binding,
      },
      inputsById: new Map([[INPUT_A.id, INPUT_A]]),
      inputBindings: {},
    });

    const rehydrated = rehydrateRigDataFromGraph(graph.spec, {
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
    });

    const restored = rehydrated.bindings[COMPONENT.id];
    expect(restored).toBeDefined();
    const slew = restored.operators?.find(
      (operator) => operator.type === "slew",
    );
    expect(slew?.enabled).toBe(true);
    expect(slew?.params.max_rate).toBe(0.4);
  });
});
