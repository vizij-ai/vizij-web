import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  CASE_GRAPH_SPEC_FIXTURE,
  CASE_METADATA_FIXTURE,
  DERIVED_GRAPH_SPEC_FIXTURE,
  RESERVED_GRAPH_SPEC_FIXTURE,
  VECTOR_GRAPH_SPEC_FIXTURE,
} from "./__fixtures__/graphSpecParity";

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

type SnapshotNode = {
  id: string;
  type: string;
  params?: unknown;
  inputDefaults?: unknown;
  metadata?: unknown;
};

type SnapshotEdge = {
  from: string | null;
  to: string | null;
  input: string | null;
  metadata?: unknown;
};

type SnapshotGraphSpec = {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
};

type RawGraphNode = {
  id: string;
  type: string;
  params?: unknown;
  input_defaults?: unknown;
  metadata?: unknown;
};

type RawGraphEdge = {
  from?: { node_id?: string | null; port_id?: string | null };
  to?: { node_id?: string | null; input?: string | null };
  metadata?: unknown;
};

function snapshotGraphSpec(
  spec: ReturnType<typeof buildRigGraphSpec>["spec"],
): SnapshotGraphSpec {
  const raw = spec as {
    nodes?: RawGraphNode[];
    edges?: RawGraphEdge[];
  };
  return {
    nodes: (raw.nodes ?? []).map((node) => {
      const entry: SnapshotNode = {
        id: node.id,
        type: node.type,
      };
      if (node.params !== undefined) {
        entry.params = node.params;
      }
      if (node.input_defaults !== undefined) {
        entry.inputDefaults = node.input_defaults;
      }
      if (node.metadata !== undefined) {
        entry.metadata = node.metadata;
      }
      return entry;
    }),
    edges: (raw.edges ?? []).map((edge) => {
      const entry: SnapshotEdge = {
        from: edge.from?.node_id ?? null,
        to: edge.to?.node_id ?? null,
        input: edge.to?.input ?? null,
      };
      if (edge.metadata !== undefined) {
        entry.metadata = edge.metadata;
      }
      return entry;
    }),
  };
}

describe("IR parity fixtures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(snapshotGraphSpec(result.spec)).toEqual(DERIVED_GRAPH_SPEC_FIXTURE);
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
    expect(snapshotGraphSpec(result.spec)).toEqual(RESERVED_GRAPH_SPEC_FIXTURE);
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
    expect(snapshotGraphSpec(result.spec)).toEqual(VECTOR_GRAPH_SPEC_FIXTURE);
  });

  it("matches for bindings that enable stacked operators", () => {
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
    const bindingWithOperators = ["spring", "damp", "slew"].reduce(
      (state, operator) =>
        setBindingOperatorEnabled(
          state,
          operator as "spring" | "damp" | "slew",
          true,
        ),
      binding,
    );

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
      bindings: {
        [COMPONENT.id]: bindingWithOperators,
      },
      inputsById: new Map([[INPUT_A.id, INPUT_A]]),
      inputBindings: {},
    });

    expectIrParity(result);
    expect(result.summary.bindings[0]?.operators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "spring", enabled: true }),
        expect.objectContaining({ type: "damp", enabled: true }),
        expect.objectContaining({ type: "slew", enabled: true }),
      ]),
    );
    expect(snapshotGraphSpec(result.spec)).toMatchInlineSnapshot(`
      {
        "edges": [
          {
            "from": "input_input_a",
            "input": "in",
            "to": "expr_component_1_3",
          },
          {
            "from": "const_component_1_1",
            "input": "input_breakpoints",
            "to": "expr_component_1_3",
          },
          {
            "from": "const_component_1_1",
            "input": "output_breakpoints",
            "to": "expr_component_1_3",
          },
          {
            "from": "expr_component_1_3",
            "input": "in",
            "to": "spring_component_1_1",
          },
          {
            "from": "spring_component_1_1",
            "input": "in",
            "to": "damp_component_1_2",
          },
          {
            "from": "damp_component_1_2",
            "input": "in",
            "to": "slew_component_1_3",
          },
          {
            "from": "slew_component_1_3",
            "input": "in",
            "to": "out_rig_robot_mouth_pos_y",
          },
        ],
        "nodes": [
          {
            "id": "input_input_a",
            "params": {
              "path": "rig/robot/controls/a",
              "value": {
                "float": 0,
              },
            },
            "type": "input",
          },
          {
            "id": "time_component_1_0",
            "metadata": {
              "reservedVariable": "time",
            },
            "type": "time",
          },
          {
            "id": "deltaTime_component_1_1",
            "metadata": {
              "reservedVariable": "deltaTime",
            },
            "type": "time",
          },
          {
            "id": "frame_component_1_2",
            "metadata": {
              "reservedVariable": "frame",
            },
            "type": "time",
          },
          {
            "id": "const_component_1_1",
            "params": {
              "value": {
                "vector": [
                  -1,
                  0,
                  1,
                ],
              },
            },
            "type": "constant",
          },
          {
            "id": "expr_component_1_3",
            "type": "piecewise_remap",
          },
          {
            "id": "spring_component_1_1",
            "params": {
              "damping": 20,
              "mass": 1,
              "stiffness": 120,
            },
            "type": "spring",
          },
          {
            "id": "damp_component_1_2",
            "params": {
              "half_life": 0.2,
            },
            "type": "damp",
          },
          {
            "id": "slew_component_1_3",
            "params": {
              "max_rate": 1,
            },
            "type": "slew",
          },
          {
            "id": "out_rig_robot_mouth_pos_y",
            "params": {
              "path": "rig/robot/mouth/pos/y",
            },
            "type": "output",
          },
        ],
      }
    `);
  });

  it("matches CASE metadata fixtures with derived selectors", () => {
    const selectorInput: StandardRigInput = {
      id: "selector_input",
      path: "/controls/selector",
      label: "Selector",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };
    const derivedInput: StandardRigInput = {
      id: "derived_case_slot",
      path: "/controls/derived_case",
      label: "Derived Case",
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
      selectorInput,
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
        alias: "selector",
        inputId: derivedInput.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_happy",
        alias: "happy",
        inputId: INPUT_B.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_sad",
        alias: "sad",
        inputId: INPUT_C.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "case(selector, sad, happy)";

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
        [selectorInput.id, selectorInput],
        [derivedInput.id, derivedInput],
        [INPUT_B.id, INPUT_B],
        [INPUT_C.id, INPUT_C],
      ]),
      inputBindings: {
        [derivedInput.id]: parentBinding,
      },
    });

    expectIrParity(result);
    const summary = result.summary.bindings.find(
      (entry) =>
        entry.targetId === COMPONENT.id && entry.slotId === "slot_selector",
    );
    expect(summary?.metadata?.expression?.case).toBeDefined();
    expect(summary?.metadata).toEqual(CASE_METADATA_FIXTURE);
    expect(snapshotGraphSpec(result.spec)).toEqual(CASE_GRAPH_SPEC_FIXTURE);
  });
});
