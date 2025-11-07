import { describe, expect, it } from "vitest";

import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { SELF_BINDING_ID } from "@vizij/utils";

import { buildRigGraphSpec } from "../graphBuilder";
import {
  addBindingSlot,
  bindingTargetFromInput,
  createDefaultBinding,
  createDefaultParentBinding,
  createDefaultRemap,
  setBindingOperatorEnabled,
  updateBindingExpression,
  updateBindingWithInput,
} from "../state";

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

function expectIrParity(result: ReturnType<typeof buildRigGraphSpec>): void {
  expect(result.ir, "IR graph is missing").toBeDefined();
  const compiled = result.ir?.compile({ preferLegacySpec: false });
  expect(compiled?.spec).toEqual(result.spec);
}

describe("IR parity fixtures", () => {
  it("matches for arithmetic expressions", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: INPUT_A.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_b",
        alias: "B",
        inputId: INPUT_B.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "A + B * 0.5";

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
        [INPUT_A.id, INPUT_A],
        [INPUT_B.id, INPUT_B],
      ]),
      inputBindings: {},
    });

    expectIrParity(result);
  });

  it("matches for derived inputs referencing other bindings", () => {
    const derivedInput: StandardRigInput = {
      id: "derived_input",
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

    const componentBinding = createDefaultBinding(COMPONENT);
    componentBinding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: derivedInput.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_b",
        alias: "B",
        inputId: INPUT_B.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    componentBinding.expression = "A - B";

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
      bindings: {
        [COMPONENT.id]: componentBinding,
      },
      inputsById: new Map([
        [INPUT_A.id, INPUT_A],
        [INPUT_B.id, INPUT_B],
        [derivedInput.id, derivedInput],
      ]),
      inputBindings: {
        [derivedInput.id]: parentBinding,
      },
    });

    expectIrParity(result);
  });

  it("matches for expressions that reference reserved variables", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: INPUT_A.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.slots.push({
      id: "slot_self",
      alias: "self_slot",
      inputId: SELF_BINDING_ID,
      remap: { ...createDefaultRemap(COMPONENT) },
    });
    binding.expression = "self + A";

    const result = buildRigGraphSpec({
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

    expectIrParity(result);
  });

  it("matches for multi-component vector bindings", () => {
    const vectorBindings: Record<
      string,
      ReturnType<typeof createDefaultBinding>
    > = {};
    VECTOR_COMPONENTS.forEach((component, index) => {
      const binding = createDefaultBinding(component);
      const input = index === 0 ? INPUT_A : index === 1 ? INPUT_B : INPUT_C;
      binding.slots[0] = {
        ...binding.slots[0],
        alias: component.component ?? `slot_${index}`,
        inputId: input.id,
        remap: { ...createDefaultRemap(component) },
      };
      binding.expression = component.component ?? binding.slots[0].alias!;
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
  });

  it("matches for bindings that enable spring operators", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: INPUT_A.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "A";
    const bindingWithSpring = setBindingOperatorEnabled(
      binding,
      "spring",
      true,
    );

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
      bindings: {
        [COMPONENT.id]: bindingWithSpring,
      },
      inputsById: new Map([[INPUT_A.id, INPUT_A]]),
      inputBindings: {},
    });

    expectIrParity(result);
  });
});
