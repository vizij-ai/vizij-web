import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import {
  buildRigGraphSpec,
  addBindingSlot,
  bindingTargetFromInput,
  createDefaultBinding,
  createDefaultParentBinding,
  updateBindingExpression,
  updateBindingWithInput,
} from "@vizij/node-graph-authoring";

const COMPONENT: AnimatableComponent = {
  id: "component_case",
  safeId: "component_case",
  animatableId: "rig/robot/mouth/pos/y",
  animatableType: "number",
  label: "Mouth Pos Y",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const ANIMATABLE: AnimatableValue = {
  id: "rig/robot/mouth/pos/y",
  type: "number",
  name: "Mouth Pos Y",
  default: 0,
  constraints: { min: -1, max: 1 },
  pub: { public: true, output: "Mouth Pos Y" },
};

const SELECTOR_INPUT: StandardRigInput = {
  id: "selector_input",
  path: "/controls/selector",
  label: "Selector",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const INPUT_HAPPY: StandardRigInput = {
  id: "input_happy",
  path: "/controls/happy",
  label: "Happy",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const INPUT_SAD: StandardRigInput = {
  id: "input_sad",
  path: "/controls/sad",
  label: "Sad",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const DERIVED_INPUT: StandardRigInput = {
  id: "derived_case_slot",
  path: "/controls/derived_case",
  label: "Derived Case",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

type StableGraphNode = {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  inputDefaults?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type StableGraphEdge = {
  from: string | null;
  to: string | null;
  input: string | null;
  metadata?: Record<string, unknown>;
};

type StableGraphSpec = {
  nodes: StableGraphNode[];
  edges: StableGraphEdge[];
};

type RawGraphNode = {
  id?: string;
  type?: string;
  params?: Record<string, unknown>;
  input_defaults?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type RawGraphEdge = {
  from?: { node_id?: string | null; input?: string | null } | null;
  to?: { node_id?: string | null; input?: string | null } | null;
  metadata?: Record<string, unknown>;
};

function snapshotGraphSpec(
  spec: ReturnType<typeof buildRigGraphSpec>["spec"],
): StableGraphSpec {
  const rawNodes = (spec.nodes ?? []) as RawGraphNode[];
  const rawEdges = (spec.edges ?? []) as RawGraphEdge[];
  return {
    nodes: rawNodes.map((node) => ({
      id: node.id ?? "",
      type: node.type ?? "",
      params:
        node.params && typeof node.params === "object"
          ? (node.params as Record<string, unknown>)
          : undefined,
      inputDefaults:
        node.input_defaults && typeof node.input_defaults === "object"
          ? (node.input_defaults as Record<string, unknown>)
          : undefined,
      metadata:
        node.metadata && typeof node.metadata === "object"
          ? (node.metadata as Record<string, unknown>)
          : undefined,
    })),
    edges: rawEdges.map((edge) => ({
      from: edge.from?.node_id ?? null,
      to: edge.to?.node_id ?? null,
      input: edge.to?.input ?? null,
      metadata:
        edge.metadata && typeof edge.metadata === "object"
          ? (edge.metadata as Record<string, unknown>)
          : undefined,
    })),
  };
}

function hashGraphSpec(spec: StableGraphSpec): string {
  const payload = JSON.stringify(spec);
  return createHash("sha256").update(payload).digest("hex");
}

function buildCaseSmokeResult() {
  let parentBinding = createDefaultParentBinding(
    bindingTargetFromInput(DERIVED_INPUT),
  );
  parentBinding = addBindingSlot(
    parentBinding,
    bindingTargetFromInput(DERIVED_INPUT),
  );
  parentBinding = updateBindingWithInput(
    parentBinding,
    bindingTargetFromInput(DERIVED_INPUT),
    SELECTOR_INPUT,
  );
  parentBinding = updateBindingExpression(
    parentBinding,
    bindingTargetFromInput(DERIVED_INPUT),
    "slot_1",
  );

  const binding = createDefaultBinding(COMPONENT);
  binding.slots = [
    {
      id: "slot_selector",
      alias: "selector",
      inputId: DERIVED_INPUT.id,
    },
    {
      id: "slot_happy",
      alias: "happy",
      inputId: INPUT_HAPPY.id,
    },
    {
      id: "slot_sad",
      alias: "sad",
      inputId: INPUT_SAD.id,
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
      [SELECTOR_INPUT.id, SELECTOR_INPUT],
      [DERIVED_INPUT.id, DERIVED_INPUT],
      [INPUT_HAPPY.id, INPUT_HAPPY],
      [INPUT_SAD.id, INPUT_SAD],
    ]),
    inputBindings: {
      [DERIVED_INPUT.id]: parentBinding,
    },
  });

  return {
    result,
    snapshot: snapshotGraphSpec(result.spec),
  };
}

const EXPECTED_GRAPH_SPEC_HASH =
  "6b1d36fea4ed5d35ebe94df1a7145d48dba79906214b908d78f5c7184f795b98";

describe("graph authoring parity smoke", () => {
  it("keeps GraphSpec hashes aligned with IR compiler output", () => {
    const { result, snapshot } = buildCaseSmokeResult();
    expect(result.ir, "authoring graph should emit IR").toBeDefined();
    const compiled = result.ir?.compile({ preferLegacySpec: false });
    expect(compiled?.spec).toEqual(result.spec);
    expect(hashGraphSpec(snapshot)).toBe(EXPECTED_GRAPH_SPEC_HASH);
  });
});
