/* eslint-disable no-useless-escape -- inline JSON snapshots need explicit escaped quotes */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { SELF_BINDING_ID, cloneDeepSafe } from "@vizij/utils";
import { buildRigGraphSpec } from "../graphBuilder";
import {
  addBindingSlot,
  bindingTargetFromInput,
  createDefaultBinding,
  createDefaultParentBinding,
  updateBindingExpression,
  updateBindingWithInput,
} from "../state";
import type { IrGraph } from "../ir/types";

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
  path: "/rig/element/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const INPUT_B: StandardRigInput = {
  id: "input_b",
  path: "/rig/element/controls/b",
  label: "Control B",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

function sanitizeEdgeEndpoint(
  endpoint: IrGraph["edges"][number]["from"] | null | undefined,
) {
  if (!endpoint) {
    return undefined;
  }
  const clean: { nodeId?: string; portId?: string; component?: string } = {};
  if (endpoint.nodeId) {
    clean.nodeId = endpoint.nodeId;
  }
  if (endpoint.portId) {
    clean.portId = endpoint.portId;
  }
  if (
    endpoint.component !== undefined &&
    endpoint.component !== null &&
    endpoint.component !== ""
  ) {
    clean.component = endpoint.component;
  }
  return clean;
}

function sanitizeIrGraph(graph: IrGraph) {
  const summary = graph.summary
    ? (cloneDeepSafe(graph.summary) as IrGraph["summary"])
    : undefined;

  return {
    nodes: graph.nodes.map((node) => {
      const sanitized: {
        id: string;
        type: string;
        params?: IrGraph["nodes"][number]["params"];
        inputDefaults?: IrGraph["nodes"][number]["inputDefaults"];
      } = {
        id: node.id,
        type: node.type,
      };
      if (node.params && Object.keys(node.params).length > 0) {
        sanitized.params = node.params;
      }
      if (node.inputDefaults && Object.keys(node.inputDefaults).length > 0) {
        sanitized.inputDefaults = node.inputDefaults;
      }
      return sanitized;
    }),
    edges: graph.edges.map((edge) => ({
      from: sanitizeEdgeEndpoint(edge.from),
      to: sanitizeEdgeEndpoint(edge.to),
    })),
    constants: graph.constants.map((constant) => ({
      id: constant.id,
      value: constant.value,
      valueType: constant.valueType,
    })),
    summary,
    metadata: {
      source: graph.metadata.source,
      registryVersion: graph.metadata.registryVersion,
    },
    issues: graph.issues,
  };
}

describe("IR snapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures scalar binding IR graph", () => {
    const binding = createDefaultBinding(COMPONENT);
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
    ];
    binding.expression = "A + B * 0.5";

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: { [ANIMATABLE.id]: ANIMATABLE },
      components: [COMPONENT],
      bindings: { [COMPONENT.id]: binding },
      inputsById: new Map([
        [INPUT_A.id, INPUT_A],
        [INPUT_B.id, INPUT_B],
      ]),
      inputBindings: {},
    });

    expect(result.ir).toBeDefined();
    const graph = result.ir?.graph;
    expect(graph).toBeDefined();
    const sanitized = sanitizeIrGraph(graph!);
    const nodeTypes = Object.fromEntries(
      sanitized.nodes.map((node) => [node.id, node.type]),
    );
    expect(nodeTypes).toMatchObject({
      input_input_a: "input",
      input_input_b: "input",
      reserved_time_1: "time",
      expr_component_1_0: "multiply",
      expr_component_1_1: "add",
      out_rig_robot_mouth_pos_y: "output",
    });
    expect(sanitized.edges).toEqual(
      expect.arrayContaining([
        {
          from: { nodeId: "input_input_b" },
          to: { nodeId: "expr_component_1_0", portId: "operand_1" },
        },
        {
          from: { nodeId: "input_input_a" },
          to: { nodeId: "expr_component_1_1", portId: "operand_1" },
        },
        {
          from: { nodeId: "expr_component_1_0" },
          to: { nodeId: "expr_component_1_1", portId: "operand_2" },
        },
        {
          from: { nodeId: "expr_component_1_1" },
          to: { nodeId: "out_rig_robot_mouth_pos_y", portId: "in" },
        },
      ]),
    );
    expect(sanitized.issues).toHaveLength(0);
  });

  it("captures derived input IR graph", () => {
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
      "selector",
    );

    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: derivedInput.id,
      },
      {
        id: "slot_b",
        alias: "B",
        inputId: SELF_BINDING_ID,
      },
    ];
    binding.expression = "A + self";

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: { [ANIMATABLE.id]: ANIMATABLE },
      components: [COMPONENT],
      bindings: { [COMPONENT.id]: binding },
      inputsById: new Map([
        [INPUT_A.id, INPUT_A],
        [derivedInput.id, derivedInput],
      ]),
      inputBindings: {
        [derivedInput.id]: parentBinding,
      },
    });

    expect(result.ir).toBeDefined();
    const sanitizedDerived = sanitizeIrGraph(result.ir!.graph);
    expect(sanitizedDerived.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "input_input_a", type: "input" }),
        expect.objectContaining({ id: "reserved_time_1", type: "time" }),
        expect.objectContaining({
          id: "const_component_1_1",
          type: "constant",
          params: { value: 0 },
        }),
        expect.objectContaining({
          id: "out_rig_robot_mouth_pos_y",
          type: "output",
          inputDefaults: { in: 0 },
        }),
      ]),
    );
    expect(sanitizedDerived.edges).toHaveLength(0);
    expect(sanitizedDerived.constants).toEqual([
      { id: "const_component_1_1", value: 0, valueType: "scalar" },
    ]);
    expect(sanitizedDerived.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Unknown control "selector".',
        "Self reference unavailable for this input.",
        'Reserved variable "self" is unavailable for this binding.',
      ]),
    );
    const bindings = sanitizedDerived.summary?.bindings ?? [];
    expect(bindings).toHaveLength(4);
    expect(bindings.every((binding) => binding.operators === undefined)).toBe(
      true,
    );
    expect(
      bindings
        .filter((binding) => binding.targetId === "component_1")
        .flatMap((binding) => binding.issues ?? []),
    ).toEqual(
      expect.arrayContaining([
        "Self reference unavailable for this input.",
        'Reserved variable "self" is unavailable for this binding.',
      ]),
    );
    expect(
      bindings
        .filter((binding) => binding.targetId === "derived_input")
        .flatMap((binding) => binding.issues ?? []),
    ).toEqual(expect.arrayContaining(['Unknown control "selector".']));
    expect(sanitizedDerived.summary?.outputs ?? []).toEqual(
      expect.arrayContaining(["derived_input"]),
    );
  });
});
