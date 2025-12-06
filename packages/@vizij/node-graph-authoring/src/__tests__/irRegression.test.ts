import { describe, expect, it } from "vitest";

import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { SELF_BINDING_ID } from "@vizij/utils";

import { buildRigGraphSpec } from "../graphBuilder";
import {
  createDefaultBinding,
  createDefaultParentBinding,
  addBindingSlot,
  bindingTargetFromInput,
  updateBindingExpression,
  updateBindingWithInput,
} from "../state";

const COMPONENT: AnimatableComponent = {
  id: "component_scalar",
  safeId: "component_scalar",
  animatableId: "rig/robot/mouth/pos/x",
  animatableType: "number",
  label: "Mouth Pos X",
  defaultValue: 0,
  range: {
    min: -1,
    max: 1,
  },
};

const ANIMATABLE: AnimatableValue = {
  id: "rig/robot/mouth/pos/x",
  type: "number",
  name: "Mouth Pos X",
  default: 0,
  constraints: {
    min: -1,
    max: 1,
  },
  pub: {
    public: true,
    output: "Mouth Pos X",
  },
};

function expectIrParity(result: ReturnType<typeof buildRigGraphSpec>): void {
  expect(result.ir, "IR graph should exist").toBeDefined();
  const compiled = result.ir?.compile({ preferLegacySpec: false });
  expect(compiled?.spec).toEqual(result.spec);
}

const VECTOR_ANIMATABLE: AnimatableValue = {
  id: "rig/robot/head/pos",
  type: "vector3",
  name: "Head Position",
  default: { x: 0, y: 0, z: 0 },
  constraints: {
    min: -1,
    max: 1,
  },
  pub: {
    public: true,
    output: "Head Position",
  },
};

const VECTOR_COMPONENTS: AnimatableComponent[] = ["x", "y", "z"].map(
  (axis) => ({
    id: `component_vec_${axis}`,
    safeId: `component_vec_${axis}`,
    animatableId: VECTOR_ANIMATABLE.id,
    animatableType: "vector3",
    component: axis,
    label: `Head ${axis.toUpperCase()}`,
    defaultValue: 0,
    range: { min: -1, max: 1 },
  }),
);

const INPUT_A: StandardRigInput = {
  id: "input_a",
  path: "/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const INPUT_B: StandardRigInput = {
  id: "input_b",
  path: "/controls/b",
  label: "Control B",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const INPUT_C: StandardRigInput = {
  id: "input_c",
  path: "/controls/c",
  label: "Control C",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

describe("IR regression coverage", () => {
  it("maintains parity for blend-heavy vector bindings", () => {
    const vectorBindings: Record<
      string,
      ReturnType<typeof createDefaultBinding>
    > = {};
    VECTOR_COMPONENTS.forEach((component) => {
      const binding = createDefaultBinding(component);
      binding.slots = [
        {
          id: "slot_a",
          alias: "A",
          inputId: INPUT_A.id,
        },
        {
          id: "slot_b",
          alias: "B",
          inputId: INPUT_B.id,
        },
        {
          id: "slot_c",
          alias: "C",
          inputId: INPUT_C.id,
        },
      ];
      binding.expression = "defaultBlend(0, 0, join(A, B, C), A, B, C)";
      vectorBindings[component.id] = binding;
    });

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [VECTOR_ANIMATABLE.id]: VECTOR_ANIMATABLE,
      },
      components: VECTOR_COMPONENTS,
      bindings: vectorBindings,
      inputsById: new Map([
        [INPUT_A.id, INPUT_A],
        [INPUT_B.id, INPUT_B],
        [INPUT_C.id, INPUT_C],
      ]),
      inputBindings: {},
    });

    expectIrParity(result);
    const hasDefaultBlend = (result.spec.nodes ?? []).some(
      (node) => node.type === "default-blend",
    );
    expect(hasDefaultBlend).toBe(true);
  });

  it("ensures conditional case graphs remain parity-safe", () => {
    const derivedInput: StandardRigInput = {
      id: "derived",
      path: "/controls/derived",
      label: "Derived",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };

    let parentBinding = createDefaultParentBinding(
      bindingTargetFromInput(derivedInput),
    );
    parentBinding = addBindingSlot(
      parentBinding,
      bindingTargetFromInput(derivedInput),
    );
    parentBinding = updateBindingWithInput(
      parentBinding,
      bindingTargetFromInput(derivedInput),
      INPUT_A,
    );
    parentBinding = updateBindingExpression(
      parentBinding,
      bindingTargetFromInput(derivedInput),
      "slot_1",
    );

    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_selector",
        alias: "mode",
        inputId: derivedInput.id,
      },
      {
        id: "slot_happy",
        alias: "happy",
        inputId: INPUT_B.id,
      },
      {
        id: "slot_self",
        alias: "selfValue",
        inputId: SELF_BINDING_ID,
      },
    ];
    binding.expression = "case(mode, 0, happy, selfValue)";

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
      bindings: {
        [COMPONENT.id]: binding,
      },
      inputsById: new Map([
        [derivedInput.id, derivedInput],
        [INPUT_B.id, INPUT_B],
      ]),
      inputBindings: {
        [derivedInput.id]: parentBinding,
      },
    });

    expectIrParity(result);
    const caseNode = (result.ir?.graph.nodes ?? []).find(
      (node) => node.type === "case",
    );
    expect(caseNode?.params).toMatchObject({
      case_labels: ["happy", "selfValue"],
    });
  });
});
