import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import {
  STANDARD_RIG_INPUTS_BY_ID,
  type StandardRigInput,
} from "./standardRigInputs";
import type { AnimatableComponent } from "./animatableMetadata";
import { buildAnimatableValue } from "./animatableMetadata";
import type { BindingMap } from "./state";
import { createDefaultRemap } from "./state";

type VectorComponent = "x" | "y" | "z" | "r" | "g" | "b";
type GraphEdge = NonNullable<GraphSpec["edges"]>[number];

interface BuildGraphOptions {
  faceId: string;
  animatables: Record<string, AnimatableValue>;
  components: AnimatableComponent[];
  bindings: BindingMap;
}

export interface GraphBindingSummary {
  targetId: string;
  animatableId: string;
  component?: VectorComponent;
  inputId: string | null;
  remap: {
    inMin: number;
    inMax: number;
    outMin: number;
    outMax: number;
  };
}

export interface BuildGraphResult {
  spec: GraphSpec;
  summary: {
    faceId: string;
    inputs: string[];
    outputs: string[];
    bindings: GraphBindingSummary[];
  };
}

function sanitizeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildRigInputPath(faceId: string, inputPath: string): string {
  const trimmed = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
  return `rig/${faceId}/${trimmed}`;
}

function getComponentOrder(
  animatable: AnimatableValue,
): VectorComponent[] | null {
  switch (animatable.type) {
    case "vector2":
      return ["x", "y"];
    case "vector3":
    case "euler":
      return ["x", "y", "z"];
    case "rgb":
      return ["r", "g", "b"];
    default:
      return null;
  }
}

interface AnimatableGraphEntry {
  animatable: AnimatableValue;
  values: Map<string, string>;
  defaults: Map<string, number>;
  isDriven: boolean;
}

type ComponentRecord = Partial<
  Record<VectorComponent | "r" | "g" | "b", unknown>
>;

function isComponentRecord(value: unknown): value is ComponentRecord {
  return typeof value === "object" && value !== null;
}

function componentIndex(component: VectorComponent): number {
  switch (component) {
    case "x":
    case "r":
      return 0;
    case "y":
    case "g":
      return 1;
    default:
      return 2;
  }
}

function extractComponentDefault(
  value: RawValue,
  component: VectorComponent,
): number {
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    const candidate = value[componentIndex(component)];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    return 0;
  }
  if (value && typeof value === "object") {
    if (!isComponentRecord(value)) {
      return 0;
    }
    const direct = value[component];
    if (typeof direct === "number" && Number.isFinite(direct)) {
      return direct;
    }
    const alt =
      component === "x" ? value.r : component === "y" ? value.g : value.b;
    if (typeof alt === "number" && Number.isFinite(alt)) {
      return alt;
    }
  }
  return 0;
}

export function buildRigGraphSpec({
  faceId,
  animatables,
  components,
  bindings,
}: BuildGraphOptions): BuildGraphResult {
  const nodes: NodeSpec[] = [];
  const edges: NonNullable<GraphSpec["edges"]> = [];
  const inputNodes = new Map<
    string,
    { nodeId: string; input: StandardRigInput }
  >();
  const summaryBindings: GraphBindingSummary[] = [];
  const animatableEntries = new Map<string, AnimatableGraphEntry>();
  const outputs = new Set<string>();

  const ensureInputNode = (
    inputId: string,
  ): { nodeId: string; input: StandardRigInput } | null => {
    const existing = inputNodes.get(inputId);
    if (existing) {
      return existing;
    }
    const input = STANDARD_RIG_INPUTS_BY_ID.get(inputId);
    if (!input) {
      return null;
    }
    const nodeId = `input_${sanitizeNodeId(inputId)}`;
    nodes.push({
      id: nodeId,
      type: "input",
      params: {
        path: buildRigInputPath(faceId, input.path),
      },
    });
    const record = { nodeId, input };
    inputNodes.set(inputId, record);
    return record;
  };

  const ensureAnimatableEntry = (
    animatableId: string,
  ): AnimatableGraphEntry | null => {
    const existing = animatableEntries.get(animatableId);
    if (existing) {
      return existing;
    }
    const animatable = animatables[animatableId];
    if (!animatable) {
      return null;
    }
    const entry: AnimatableGraphEntry = {
      animatable,
      values: new Map<string, string>(),
      defaults: new Map<string, number>(),
      isDriven: false,
    };
    animatableEntries.set(animatableId, entry);
    return entry;
  };

  components.forEach((component) => {
    const binding = bindings[component.id];
    const entry = ensureAnimatableEntry(component.animatableId);
    if (!entry) {
      return;
    }
    let valueNodeId: string;

    if (binding && binding.inputId) {
      const inputNode = ensureInputNode(binding.inputId);
      if (!inputNode) {
        return;
      }
      const remapNodeId = `remap_${sanitizeNodeId(component.id)}`;
      nodes.push({
        id: remapNodeId,
        type: "remap",
        input_defaults: {
          in_min: binding.remap.inMin,
          in_max: binding.remap.inMax,
          out_min: binding.remap.outMin,
          out_max: binding.remap.outMax,
        },
      });
      edges.push({
        from: { node_id: inputNode.nodeId },
        to: { node_id: remapNodeId, input: "in" },
      });
      valueNodeId = remapNodeId;
      entry.isDriven = true;
      summaryBindings.push({
        targetId: component.id,
        animatableId: component.animatableId,
        component: component.component,
        inputId: binding.inputId,
        remap: { ...binding.remap },
      });
    } else {
      const remap = binding?.remap ?? createDefaultRemap(component);
      const key = component.component ?? "scalar";
      entry.defaults.set(key, component.defaultValue);
      summaryBindings.push({
        targetId: component.id,
        animatableId: component.animatableId,
        component: component.component,
        inputId: null,
        remap: { ...remap },
      });
      return;
    }

    const key = component.component ?? "scalar";
    entry.values.set(key, valueNodeId);
  });

  animatableEntries.forEach((entry, animatableId) => {
    if (!entry.isDriven) {
      return;
    }
    outputs.add(animatableId);
    const safeId = sanitizeNodeId(animatableId);
    const order = getComponentOrder(entry.animatable);
    if (!order) {
      const valueNodeId = entry.values.get("scalar");
      if (!valueNodeId) {
        return;
      }
      const outputNodeId = `out_${safeId}`;
      nodes.push({
        id: outputNodeId,
        type: "output",
        params: {
          path: animatableId,
        },
      });
      edges.push({
        from: { node_id: valueNodeId },
        to: { node_id: outputNodeId, input: "in" },
      });
      return;
    }

    const joinNodeId = `join_${safeId}`;
    nodes.push({
      id: joinNodeId,
      type: "join",
    });

    order.forEach((componentKey, index) => {
      let sourceId = entry.values.get(componentKey);
      if (!sourceId) {
        const componentDefault =
          entry.defaults.get(componentKey) ??
          extractComponentDefault(
            buildAnimatableValue(entry.animatable, undefined),
            componentKey,
          );
        const constNodeId = `const_${safeId}_${componentKey}`;
        nodes.push({
          id: constNodeId,
          type: "constant",
          params: {
            value: componentDefault,
          },
        });
        sourceId = constNodeId;
      }
      edges.push({
        from: { node_id: sourceId },
        to: { node_id: joinNodeId, input: `operand_${index + 1}` },
      });
    });

    const outputNodeId = `out_${safeId}`;
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: {
        path: animatableId,
      },
    });
    edges.push({
      from: { node_id: joinNodeId },
      to: { node_id: outputNodeId, input: "in" },
    });
  });

  const nodeById = new Map<string, NodeSpec>();
  nodes.forEach((node) => {
    nodeById.set(node.id, node);
  });

  const constantUsage = new Map<string, number>();
  edges.forEach((edge: GraphEdge) => {
    const source = nodeById.get(edge.from.node_id);
    if (source?.type === "constant") {
      constantUsage.set(source.id, (constantUsage.get(source.id) ?? 0) + 1);
    }
  });

  const updatedEdges: NonNullable<GraphSpec["edges"]> = [];
  const constantsToRemove = new Set<string>();

  edges.forEach((edge: GraphEdge) => {
    const source = nodeById.get(edge.from.node_id);
    if (
      source?.type === "constant" &&
      constantUsage.get(source.id) === 1 &&
      source.params &&
      Object.prototype.hasOwnProperty.call(source.params, "value")
    ) {
      const target = nodeById.get(edge.to.node_id);
      if (target) {
        const value = (source.params as { value?: unknown }).value;
        if (value !== undefined) {
          target.input_defaults = {
            ...(target.input_defaults ?? {}),
            [edge.to.input]: value,
          };
          nodeById.set(target.id, target);
          constantsToRemove.add(source.id);
          return;
        }
      }
    }
    updatedEdges.push(edge);
  });

  const filteredNodes = nodes
    .filter((node) => !constantsToRemove.has(node.id))
    .map((node) => nodeById.get(node.id) ?? node);

  const dynamicOutputs = Array.from(outputs);
  const filteredSummaryBindings = summaryBindings.filter((binding) =>
    outputs.has(binding.animatableId),
  );

  const spec: GraphSpec = {
    nodes: filteredNodes,
    edges: updatedEdges.length ? updatedEdges : undefined,
  };

  return {
    spec,
    summary: {
      faceId,
      inputs: Array.from(inputNodes.values()).map(({ input }) =>
        buildRigInputPath(faceId, input.path),
      ),
      outputs: dynamicOutputs,
      bindings: filteredSummaryBindings,
    },
  };
}
