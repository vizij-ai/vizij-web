import { describe, expect, it } from "vitest";

import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";

import { buildRigGraphSpec } from "../graphBuilder";
import {
  createDefaultBinding,
  createDefaultRemap,
  createDefaultParentBinding,
  bindingTargetFromInput,
  addBindingSlot,
  updateBindingWithInput,
  updateBindingExpression,
} from "../state";
import { SELF_BINDING_ID } from "@vizij/utils";

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

    const vizijMetadata = (spec as Record<string, unknown>).metadata as {
      vizij?: { bindings?: unknown[]; inputs?: unknown[] };
    };
    expect(vizijMetadata?.vizij?.bindings).toBeDefined();
    expect(vizijMetadata?.vizij?.inputs).toBeDefined();
    expect(vizijMetadata?.vizij?.bindings).toHaveLength(summaryEntries.length);
  });

  it("creates comparison and logical nodes from expressions", () => {
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
        inputId: INPUT_C.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "A > B && !C";

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
      ]),
      inputBindings: {},
    });

    const nodeTypes = new Set(
      spec.nodes.map((node: GraphSpec["nodes"][number]) => node.type),
    );
    expect(nodeTypes.has("greaterthan")).toBe(true);
    expect(nodeTypes.has("not")).toBe(true);
    expect(nodeTypes.has("and")).toBe(true);
  });

  it("embeds input metadata in the exported vizij header", () => {
    const { spec } = buildRigGraphSpec({
      faceId: "robot",
      animatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
      components: [COMPONENT],
      bindings: {
        [COMPONENT.id]: createDefaultBinding(COMPONENT),
      },
      inputsById: new Map<string, StandardRigInput>([
        [INPUT_A.id, INPUT_A],
        [INPUT_B.id, INPUT_B],
      ]),
      inputBindings: {},
      inputMetadata: new Map([
        [INPUT_A.id, { source: "auto", root: "eyes" }],
        [INPUT_B.id, { source: "custom", root: "brows" }],
      ]),
    });

    const vizijMetadata = (spec as Record<string, unknown>).metadata as {
      vizij?: { inputs?: Array<Record<string, unknown>> };
    };
    expect(vizijMetadata?.vizij?.inputs).toBeDefined();
    expect(vizijMetadata?.vizij?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: INPUT_A.id,
          source: "auto",
          root: "eyes",
        }),
        expect.objectContaining({
          id: INPUT_B.id,
          source: "custom",
          root: "brows",
        }),
      ]),
    );
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

  it("creates graph nodes for trig, clamp, and power functions", () => {
    const binding = createDefaultBinding(COMPONENT);
    const INPUT_C: StandardRigInput = {
      id: "input_c",
      path: "/controls/c",
      label: "Control C",
      group: "controls",
      defaultValue: 0.5,
      range: { min: -1, max: 1 },
    };
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
        inputId: INPUT_C.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    binding.expression = "clamp(sin(A), 0, 1) + power(B, C)";

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
      ]),
      inputBindings: {},
    });

    const sinNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "sin",
    );
    expect(sinNode).toBeDefined();
    const clampNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "clamp",
    );
    expect(clampNode).toBeDefined();
    const powerNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "power",
    );
    expect(powerNode).toBeDefined();

    const edges: NonNullable<GraphSpec["edges"]> = spec.edges
      ? [...spec.edges]
      : [];
    const clampInputs = edges
      .filter(
        (edge: NonNullable<GraphSpec["edges"]>[number]) =>
          edge.to.node_id === clampNode?.id,
      )
      .map((edge: NonNullable<GraphSpec["edges"]>[number]) => edge.to.input);
    expect(clampInputs).toEqual(["in"]);
    expect(clampNode?.input_defaults).toMatchObject({ min: 0, max: 1 });

    const powerInputs = edges
      .filter(
        (edge: NonNullable<GraphSpec["edges"]>[number]) =>
          edge.to.node_id === powerNode?.id,
      )
      .map((edge: NonNullable<GraphSpec["edges"]>[number]) => edge.to.input)
      .sort();
    expect(powerInputs).toEqual(["base", "exp"].sort());
  });

  it("attaches an IR envelope that can be compiled via the legacy spec", () => {
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

    expect(result.ir).toBeDefined();
    expect(result.ir?.graph.faceId).toBe("robot");
    const compiled = result.ir?.compile();
    expect(compiled?.spec).toEqual(result.spec);
    const pureCompile = result.ir?.compile({ preferLegacySpec: false });
    expect(pureCompile?.spec.nodes).toEqual(result.spec.nodes);
    expect(pureCompile?.spec.edges).toEqual(result.spec.edges);
  });

  it("creates comparison and logic nodes via metadata functions", () => {
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
    binding.expression = "if(gt(A, B), A, clamp(B, 0, 1))";

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

    const greaterNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "greaterthan",
    );
    expect(greaterNode).toBeDefined();
    const ifNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "if",
    );
    expect(ifNode).toBeDefined();
  });

  it("creates blend nodes via metadata-driven functions", () => {
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
        inputId: INPUT_C.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "defaultBlend(0, 0, join(A, B, C), A, B, C)";

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
      ]),
      inputBindings: {},
    });

    const blendNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "default-blend",
    );
    expect(blendNode).toBeDefined();
  });

  it("reports issues for incorrect metadata function arity", () => {
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
    binding.expression = "greaterThan(A)";

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

    const issues = result.issues.byTarget[COMPONENT.id];
    expect(issues).toBeDefined();
    expect(issues?.some((issue) => issue.includes("expects at least"))).toBe(
      true,
    );
  });

  it("applies spring operators after the expression", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots[0] = {
      ...binding.slots[0],
      inputId: INPUT_A.id,
      remap: { ...createDefaultRemap(COMPONENT) },
    };
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    const springOperator = binding.operators?.find(
      (operator) => operator.type === "spring",
    );
    expect(springOperator).toBeDefined();
    if (springOperator) {
      springOperator.enabled = true;
      springOperator.params.stiffness = 200;
    }

    const { spec } = buildRigGraphSpec({
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

    const springNode = spec.nodes.find((node) => node.type === "spring");
    expect(springNode).toBeDefined();
    expect(
      (springNode?.params as Record<string, number> | undefined)?.stiffness,
    ).toBe(200);
  });

  it("applies damp operators with configured params", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots[0] = {
      ...binding.slots[0],
      inputId: INPUT_A.id,
      remap: { ...createDefaultRemap(COMPONENT) },
    };
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    const dampOperator = binding.operators?.find(
      (operator) => operator.type === "damp",
    );
    expect(dampOperator).toBeDefined();
    if (dampOperator) {
      dampOperator.enabled = true;
      dampOperator.params.half_life = 0.5;
    }

    const { spec } = buildRigGraphSpec({
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

    const dampNode = spec.nodes.find((node) => node.type === "damp");
    expect(dampNode).toBeDefined();
    expect(
      (dampNode?.params as Record<string, number> | undefined)?.half_life,
    ).toBe(0.5);
  });

  it("applies slew operators with configured params", () => {
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
    expect(slewOperator).toBeDefined();
    if (slewOperator) {
      slewOperator.enabled = true;
      slewOperator.params.max_rate = 0.25;
    }

    const { spec } = buildRigGraphSpec({
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

    const slewNode = spec.nodes.find((node) => node.type === "slew");
    expect(slewNode).toBeDefined();
    expect(
      (slewNode?.params as Record<string, number> | undefined)?.max_rate,
    ).toBe(0.25);
  });

  it("exports operator metadata in binding summaries", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots[0] = {
      ...binding.slots[0],
      inputId: INPUT_A.id,
      remap: { ...createDefaultRemap(COMPONENT) },
    };
    binding.inputId = INPUT_A.id;
    binding.remap = { ...binding.slots[0].remap };
    const dampOperator = binding.operators?.find(
      (operator) => operator.type === "damp",
    );
    if (dampOperator) {
      dampOperator.enabled = true;
      dampOperator.params.half_life = 0.33;
    }

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

    const summaryEntry = result.summary.bindings.find(
      (entry) =>
        entry.targetId === COMPONENT.id &&
        entry.slotAlias === binding.slots[0]?.alias,
    );
    expect(summaryEntry?.operators).toBeDefined();
    const dampSummary = summaryEntry?.operators?.find(
      (operator) => operator.type === "damp",
    );
    expect(dampSummary?.enabled).toBe(true);
    expect(dampSummary?.params?.half_life).toBe(0.33);
  });

  it("creates case nodes with aliases as labels", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_selector",
        alias: "mode",
        inputId: INPUT_A.id,
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
        inputId: null,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "case(mode, 0, happy, sad)";

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

    const caseNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]) => node.type === "case",
    );
    expect(caseNode).toBeDefined();
    expect(caseNode?.params).toMatchObject({
      case_labels: ["happy", "sad"],
    });
  });

  it("emits type errors when vector functions receive scalar operands", () => {
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
    binding.expression = "vectoradd(A, B)";

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

    const issues = result.issues.byTarget[COMPONENT.id] ?? [];
    expect(
      issues.some(
        (issue) =>
          issue.includes("vectoradd") &&
          issue.includes("expects a vector input"),
      ),
    ).toBe(true);
  });

  it("supports deltaTime and frame reserved variables", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.expression = "deltaTime + frame";

    const { spec } = buildRigGraphSpec({
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

    const reservedNodes = (spec.nodes ?? []).filter(
      (node) =>
        (node.metadata as { reservedVariable?: string } | undefined)
          ?.reservedVariable,
    );
    expect(
      reservedNodes.map((node) => node.metadata?.reservedVariable),
    ).toEqual(expect.arrayContaining(["deltaTime", "frame"]));
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

  it("reports issues for function argument mismatches", () => {
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
    binding.expression = "log(A)";

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

    const mismatchMessage =
      'Function "log" expects at least 2 arguments, received 1.';
    const targetIssues = result.issues.byTarget[COMPONENT.id];
    expect(targetIssues).toBeDefined();
    expect(targetIssues).toContain(mismatchMessage);
    const summaryEntry = result.summary.bindings.find(
      (entry) => entry.targetId === COMPONENT.id,
    );
    expect(summaryEntry?.issues).toContain(mismatchMessage);
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
it("creates scalar math nodes like abs/min/max/modulo/round", () => {
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
      inputId: INPUT_C.id,
      remap: { ...createDefaultRemap(COMPONENT) },
    },
  ];
  binding.expression = "round(abs(A) + min(B, C) - max(A, B) + modulo(A, B))";

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
    ]),
    inputBindings: {},
  });

  const nodeTypes = new Set(
    (spec.nodes ?? []).map((node: GraphSpec["nodes"][number]) => node.type),
  );
  expect(nodeTypes.has("abs")).toBe(true);
  expect(
    Array.from(nodeTypes).some((type) => type === "min" || type === "max"),
  ).toBe(true);
  expect(nodeTypes.has("modulo")).toBe(true);
  expect(nodeTypes.has("round")).toBe(true);
});
