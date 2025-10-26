import { describe, expect, it } from "vitest";

import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";

import { buildRigGraphSpec } from "./graphBuilder";
import {
  createDefaultBinding,
  createDefaultRemap,
  createDefaultParentBinding,
  bindingTargetFromInput,
  addBindingSlot,
  updateBindingWithInput,
  updateBindingExpression,
} from "./state";
import { SELF_BINDING_ID } from "@vizij/utils";

const COMPONENT: AnimatableComponent = {
  id: "component_1",
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

describe("buildRigGraphSpec", () => {
  it("creates arithmetic nodes for multi-control expressions", () => {
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
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    binding.expression = "A + B";

    const { spec, summary } = buildRigGraphSpec({
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

    const addNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "add",
    );
    expect(addNode).toBeDefined();

    const remapNodes = spec.nodes.filter(
      (node: GraphSpec["nodes"][number]) => node.type === "centered_remap",
    );
    expect(remapNodes).toHaveLength(2);

    const summaryEntries = summary.bindings;
    expect(summaryEntries).toHaveLength(2);
    expect(summaryEntries.every((entry) => entry.expression === "A + B")).toBe(
      true,
    );
    expect(summaryEntries.map((entry) => entry.inputId).sort()).toEqual([
      "input_a",
      "input_b",
    ]);
  });

  it("creates subtract nodes with lhs/rhs inputs", () => {
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
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    binding.expression = "A - B";

    const { spec } = buildRigGraphSpec({
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

    const subtractNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "subtract",
    );
    expect(subtractNode).toBeDefined();
    const subtractEdges: NonNullable<GraphSpec["edges"]> = spec.edges
      ? [...spec.edges]
      : [];
    const lhsEdge = subtractEdges.find(
      (edge: NonNullable<GraphSpec["edges"]>[number]) =>
        edge.to.node_id === subtractNode?.id && edge.to.input === "lhs",
    );
    const rhsEdge = subtractEdges.find(
      (edge: NonNullable<GraphSpec["edges"]>[number]) =>
        edge.to.node_id === subtractNode?.id && edge.to.input === "rhs",
    );
    expect(lhsEdge).toBeDefined();
    expect(rhsEdge).toBeDefined();
  });

  it("supports parentheses and division with nested expressions", () => {
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
      {
        id: "slot_c",
        alias: "C",
        inputId: "input_c",
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_d",
        alias: "D",
        inputId: "input_d",
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    binding.expression = "(A + B) / (C - D)";

    const INPUT_C: StandardRigInput = {
      id: "input_c",
      path: "/controls/c",
      label: "Control C",
      group: "controls",
      defaultValue: 1,
      range: { min: -1, max: 1 },
    };
    const INPUT_D: StandardRigInput = {
      id: "input_d",
      path: "/controls/d",
      label: "Control D",
      group: "controls",
      defaultValue: 1,
      range: { min: -1, max: 1 },
    };

    const { spec } = buildRigGraphSpec({
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
        [INPUT_C.id, INPUT_C],
        [INPUT_D.id, INPUT_D],
      ]),
      inputBindings: {},
    });

    const addNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "add",
    );
    expect(addNode).toBeDefined();
    const divideNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "divide",
    );
    expect(divideNode).toBeDefined();

    const allEdges: NonNullable<GraphSpec["edges"]> = spec.edges
      ? [...spec.edges]
      : [];
    const addInputs = allEdges
      .filter(
        (edge: NonNullable<GraphSpec["edges"]>[number]) =>
          edge.to.node_id === addNode?.id,
      )
      .map((edge: NonNullable<GraphSpec["edges"]>[number]) => edge.to.input);
    expect(addInputs).toContain("operand_1");
    expect(addInputs).toContain("operand_2");

    const divideLhs = allEdges.find(
      (edge: NonNullable<GraphSpec["edges"]>[number]) =>
        edge.to.node_id === divideNode?.id && edge.to.input === "lhs",
    );
    const divideRhs = allEdges.find(
      (edge: NonNullable<GraphSpec["edges"]>[number]) =>
        edge.to.node_id === divideNode?.id && edge.to.input === "rhs",
    );
    expect(divideLhs).toBeDefined();
    expect(divideRhs).toBeDefined();
  });

  it("blends parent bindings with manual slider", () => {
    const componentBinding = createDefaultBinding(COMPONENT);
    componentBinding.slots[0] = {
      id: "slot_parent",
      alias: "P",
      inputId: INPUT_A.id,
      remap: { ...createDefaultRemap(COMPONENT) },
    };
    componentBinding.inputId = INPUT_A.id;
    componentBinding.remap = { ...componentBinding.slots[0].remap };
    componentBinding.expression = "P";

    const inputTarget = bindingTargetFromInput(INPUT_A);
    let parentBinding = createDefaultParentBinding(inputTarget);
    parentBinding = addBindingSlot(parentBinding, inputTarget);
    const newSlot = parentBinding.slots[parentBinding.slots.length - 1];
    parentBinding = updateBindingWithInput(
      parentBinding,
      inputTarget,
      INPUT_B,
      newSlot?.id,
    );
    if (newSlot?.alias) {
      parentBinding = updateBindingExpression(
        parentBinding,
        inputTarget,
        newSlot.alias,
      );
    }
    parentBinding = {
      ...parentBinding,
      inputId: SELF_BINDING_ID,
      slots: parentBinding.slots.map((slot, index) =>
        index === 0
          ? {
              ...slot,
              alias: "self",
              inputId: SELF_BINDING_ID,
            }
          : slot,
      ),
    };

    const { spec, summary } = buildRigGraphSpec({
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
      ]),
      inputBindings: {
        [INPUT_A.id]: parentBinding,
      },
    });

    const sliderNode = (spec.nodes ?? []).find(
      (node: NodeSpec) => node.id === "input_raw_input_a",
    );
    expect(sliderNode).toBeDefined();

    const parentSlotSummary = summary.bindings.find(
      (entry) => entry.targetId === INPUT_A.id && entry.inputId === INPUT_B.id,
    );
    expect(parentSlotSummary).toBeDefined();

    const selfSlotSummary = summary.bindings.find(
      (entry) => entry.targetId === INPUT_A.id && entry.slotAlias === "self",
    );
    expect(selfSlotSummary).toBeDefined();
  });
});

describe("buildRigGraphSpec issues", () => {
  it("captures fatal expression errors per target", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: INPUT_A.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    binding.expression = "A + C";

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

    const issueList = result.issues.byTarget[COMPONENT.id];
    expect(issueList).toBeDefined();
    expect(issueList).toContain('Unknown control "C".');
    expect(result.issues.fatal).toContain('Unknown control "C".');
    const summaryEntry = result.summary.bindings.find(
      (entry) => entry.targetId === COMPONENT.id,
    );
    expect(summaryEntry?.issues).toContain('Unknown control "C".');
  });

  it("materialises derived input remaps", () => {
    const derivedInput: StandardRigInput = {
      id: "derived_input",
      path: "/controls/derived",
      label: "Derived",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };

    let derivedBinding = createDefaultBinding(
      bindingTargetFromInput(derivedInput),
    );
    derivedBinding = updateBindingWithInput(
      derivedBinding,
      bindingTargetFromInput(derivedInput),
      INPUT_A,
    );

    let componentBinding = createDefaultBinding(COMPONENT);
    componentBinding = updateBindingWithInput(
      componentBinding,
      COMPONENT,
      derivedInput,
    );

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
        [derivedInput.id, derivedInput],
      ]),
      inputBindings: {
        [derivedInput.id]: derivedBinding,
      },
    });

    const derivedSummary = result.summary.bindings.find(
      (entry) => entry.targetId === derivedInput.id,
    );
    expect(derivedSummary).toBeDefined();
    expect(derivedSummary?.inputId).toBe(INPUT_A.id);

    expect(result.summary.inputs).toContain("rig/robot/controls/derived");
    expect(result.summary.outputs).toContain(derivedInput.id);

    const remapNodes = result.spec.nodes.filter(
      (node: GraphSpec["nodes"][number]) => node.type === "centered_remap",
    );
    expect(remapNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("flags derived input cycles", () => {
    const derivedA: StandardRigInput = {
      id: "derived_a",
      path: "/controls/derived_a",
      label: "Derived A",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };
    const derivedB: StandardRigInput = {
      id: "derived_b",
      path: "/controls/derived_b",
      label: "Derived B",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };

    let bindingA = createDefaultBinding(bindingTargetFromInput(derivedA));
    bindingA = updateBindingWithInput(
      bindingA,
      bindingTargetFromInput(derivedA),
      derivedB,
    );
    let bindingB = createDefaultBinding(bindingTargetFromInput(derivedB));
    bindingB = updateBindingWithInput(
      bindingB,
      bindingTargetFromInput(derivedB),
      derivedA,
    );

    let componentBinding = createDefaultBinding(COMPONENT);
    componentBinding = updateBindingWithInput(
      componentBinding,
      COMPONENT,
      derivedA,
    );

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
        [derivedA.id, derivedA],
        [derivedB.id, derivedB],
      ]),
      inputBindings: {
        [derivedA.id]: bindingA,
        [derivedB.id]: bindingB,
      },
    });

    expect(result.issues.byTarget[derivedA.id]).toContain(
      "Derived input cycle detected.",
    );
    const derivedBIssues = result.issues.byTarget[derivedB.id];
    if (derivedBIssues) {
      expect(derivedBIssues.length).toBeGreaterThan(0);
    }
  });
});
