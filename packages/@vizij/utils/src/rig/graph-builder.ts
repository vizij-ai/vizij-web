import type {
  RigDriver,
  RigDriverGraph,
  RigDriverOutput,
  RigDriverTarget,
  RigDriverTransform,
} from "./drivers";
import type { StandardRigInput } from "./standard-inputs";

export interface GraphNodeSpec {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  input_defaults?: Record<string, unknown>;
}

export interface GraphEdgeSpec {
  from: { node_id: string };
  to: { node_id: string; input: string };
  selector?: unknown;
}

export interface RigGraphSpec {
  nodes: GraphNodeSpec[];
  edges?: GraphEdgeSpec[];
}

type NodeSpec = GraphNodeSpec;
type GraphEdge = GraphEdgeSpec;

export type RigDriverBlendStrategy = "additive" | "average" | "weights";

export interface DriverConflictPolicy {
  defaultStrategy: RigDriverBlendStrategy;
  /**
   * Optional per-target override e.g. { "rig/robot/jaw/open": "weights" }.
   */
  perTarget?: Map<string, RigDriverBlendStrategy>;
}

export interface BuildRigGraphOptions {
  driverGraph: RigDriverGraph;
  /**
   * Optional weighting function when the strategy is `weights`.
   * Return a normalized weight for the driver-output tuple.
   */
  resolveWeight?: (driver: RigDriver, output: RigDriverOutput) => number;
  conflictPolicy?: DriverConflictPolicy;
}

interface DriverNodeRef {
  nodeId: string;
  driver: RigDriver;
  output: RigDriverOutput;
}

interface TargetAccumulator {
  target?: RigDriverTarget;
  baseline?: string;
  neutral?: number;
  remapNodes: DriverNodeRef[];
  poseNodes: DriverNodeRef[];
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function ensureInputNode(
  inputNodes: Map<string, NodeSpec>,
  nodes: NodeSpec[],
  id: string,
  path: string,
): string {
  const existing = inputNodes.get(id);
  if (existing) {
    return existing.id;
  }
  const nodeId = `input_${sanitizeId(id)}`;
  const node: NodeSpec = {
    id: nodeId,
    type: "input",
    params: { path },
  };
  inputNodes.set(id, node);
  nodes.push(node);
  return nodeId;
}

function createCenteredRemapNode(
  nodes: NodeSpec[],
  ref: DriverNodeRef,
): string {
  const nodeId = `remap_${sanitizeId(`${ref.driver.id}_${ref.output.target.id}`)}`;
  const transform = ref.output.transform;
  if (transform.type !== "centered-remap") {
    throw new Error("Expected centered-remap transform.");
  }
  nodes.push({
    id: nodeId,
    type: "centered_remap",
    input_defaults: {
      in_low: transform.inLow,
      in_anchor: transform.inAnchor,
      in_high: transform.inHigh,
      out_low: transform.outLow,
      out_anchor: transform.outAnchor,
      out_high: transform.outHigh,
    },
  });
  return nodeId;
}

function createLinearRemapNode(nodes: NodeSpec[], ref: DriverNodeRef): string {
  const nodeId = `linear_${sanitizeId(`${ref.driver.id}_${ref.output.target.id}`)}`;
  const transform = ref.output.transform;
  if (transform.type !== "linear-remap") {
    throw new Error("Expected linear-remap transform.");
  }
  nodes.push({
    id: nodeId,
    type: "remap",
    input_defaults: {
      in_low: transform.inMin,
      in_high: transform.inMax,
      out_low: transform.outMin,
      out_high: transform.outMax,
    },
  });
  return nodeId;
}

function toNodeValue(transform: RigDriverTransform): number | undefined {
  switch (transform.type) {
    case "pose-delta":
      return transform.value;
    case "centered-remap":
    case "linear-remap":
      return undefined;
    default:
      return undefined;
  }
}

function createConstantNode(
  nodes: NodeSpec[],
  targetId: string,
  key: string,
  value: number,
): string {
  const nodeId = `const_${sanitizeId(`${targetId}_${key}`)}`;
  nodes.push({
    id: nodeId,
    type: "constant",
    params: { value },
  });
  return nodeId;
}

function ensureBlendBaseline(
  acc: TargetAccumulator,
  nodes: NodeSpec[],
  target: RigDriverTarget,
): string | undefined {
  if (acc.baseline !== undefined) {
    return acc.baseline;
  }
  if (acc.neutral === undefined) {
    return undefined;
  }
  const nodeId = createConstantNode(nodes, target.id, "baseline", acc.neutral);
  acc.baseline = nodeId;
  return nodeId;
}

function recordDriverOutputs(
  driver: RigDriver,
  outputs: RigDriverOutput[],
  nodes: NodeSpec[],
  edges: GraphEdge[],
  inputNodes: Map<string, NodeSpec>,
  targetMap: Map<string, TargetAccumulator>,
  standardInputsById: Map<string, StandardRigInput>,
) {
  outputs.forEach((output) => {
    const { target, transform } = output;
    let accumulator = targetMap.get(target.id);
    if (!accumulator) {
      accumulator = {
        remapNodes: [],
        poseNodes: [],
      };
      targetMap.set(target.id, accumulator);
    }
    accumulator.target = target;

    const ref: DriverNodeRef = { driver, output, nodeId: "" };
    let sourceNodeId: string | undefined;

    switch (transform.type) {
      case "centered-remap": {
        if (!driver.source.path) {
          return;
        }
        const sourceInput = standardInputsById.get(driver.source.id);
        const path = sourceInput?.path ?? driver.source.path;
        const inputNodeId = ensureInputNode(
          inputNodes,
          nodes,
          driver.source.id,
          path,
        );
        const remapNodeId = createCenteredRemapNode(nodes, ref);
        edges.push({
          from: { node_id: inputNodeId },
          to: { node_id: remapNodeId, input: "in" },
        });
        accumulator.remapNodes.push({
          ...ref,
          nodeId: remapNodeId,
        });
        sourceNodeId = remapNodeId;
        break;
      }
      case "linear-remap": {
        if (!driver.source.path) {
          return;
        }
        const inputNodeId = ensureInputNode(
          inputNodes,
          nodes,
          driver.source.id,
          driver.source.path,
        );
        const remapNodeId = createLinearRemapNode(nodes, ref);
        edges.push({
          from: { node_id: inputNodeId },
          to: { node_id: remapNodeId, input: "in" },
        });
        accumulator.remapNodes.push({
          ...ref,
          nodeId: remapNodeId,
        });
        sourceNodeId = remapNodeId;
        break;
      }
      case "pose-delta": {
        const value = toNodeValue(transform);
        if (value === undefined) {
          return;
        }
        accumulator.neutral = transform.neutral;
        const constNodeId = createConstantNode(
          nodes,
          target.id,
          driver.id,
          value,
        );
        accumulator.poseNodes.push({ ...ref, nodeId: constNodeId });
        sourceNodeId = constNodeId;
        break;
      }
      default:
        break;
    }

    if (sourceNodeId && transform.type === "pose-delta") {
      // Pose deltas do not immediately wire to outputs; they are aggregated later.
      return;
    }
  });
}

function applyBlendStrategy(
  targetId: string,
  acc: TargetAccumulator,
  nodes: NodeSpec[],
  edges: GraphEdge[],
  strategy: RigDriverBlendStrategy,
  resolveWeight?: (driver: RigDriver, output: RigDriverOutput) => number,
): string | null {
  if (!acc.remapNodes.length && !acc.poseNodes.length) {
    return null;
  }

  if (!acc.remapNodes.length && acc.poseNodes.length) {
    if (acc.poseNodes.length === 1) {
      return acc.poseNodes[0]?.nodeId ?? null;
    }
    const joinId = `pose_join_${sanitizeId(targetId)}`;
    nodes.push({ id: joinId, type: "join" });
    acc.poseNodes.forEach((nodeRef, index) => {
      edges.push({
        from: { node_id: nodeRef.nodeId },
        to: { node_id: joinId, input: `operand_${index + 1}` },
      });
    });
    return joinId;
  }

  if (acc.remapNodes.length === 1 && acc.poseNodes.length === 0) {
    return acc.remapNodes[0]?.nodeId ?? null;
  }

  const blendId = `blend_${sanitizeId(targetId)}`;
  nodes.push({ id: blendId, type: "default-blend" });

  // Baseline
  const baselineTarget =
    acc.target ?? ({ id: targetId, type: "rig-input" } as RigDriverTarget);
  const baselineNodeId = ensureBlendBaseline(acc, nodes, baselineTarget);
  if (baselineNodeId) {
    edges.push({
      from: { node_id: baselineNodeId },
      to: { node_id: blendId, input: "baseline" },
    });
  }

  // Offset zero constant
  const offsetNodeId = createConstantNode(nodes, targetId, "offset", 0);
  edges.push({
    from: { node_id: offsetNodeId },
    to: { node_id: blendId, input: "offset" },
  });

  const operands: DriverNodeRef[] = [...acc.remapNodes, ...acc.poseNodes];
  operands.forEach((nodeRef, index) => {
    edges.push({
      from: { node_id: nodeRef.nodeId },
      to: { node_id: blendId, input: `operand_${index + 1}` },
    });
  });

  const shouldApplyWeights = strategy === "weights" || strategy === "average";

  if (shouldApplyWeights) {
    const weightsNodeId = `weights_${sanitizeId(targetId)}`;
    nodes.push({ id: weightsNodeId, type: "join" });
    const weightResolver =
      resolveWeight ??
      ((driver: RigDriver, output: RigDriverOutput) =>
        strategy === "average" && operands.length > 0
          ? 1 / operands.length
          : 1);
    operands.forEach((nodeRef, index) => {
      const weight = weightResolver(nodeRef.driver, nodeRef.output);
      const constNodeId = createConstantNode(
        nodes,
        targetId,
        `weight_${index}`,
        weight,
      );
      edges.push({
        from: { node_id: constNodeId },
        to: { node_id: weightsNodeId, input: `operand_${index + 1}` },
      });
    });
    edges.push({
      from: { node_id: weightsNodeId },
      to: { node_id: blendId, input: "weights" },
    });
  }

  return blendId;
}

function resolveStrategy(
  targetId: string,
  policy: DriverConflictPolicy | undefined,
): RigDriverBlendStrategy {
  if (!policy) {
    return "additive";
  }
  if (policy.perTarget?.has(targetId)) {
    return policy.perTarget.get(targetId)!;
  }
  return policy.defaultStrategy;
}

export function buildGraphFromDrivers({
  driverGraph,
  resolveWeight,
  conflictPolicy,
}: BuildRigGraphOptions): RigGraphSpec {
  const nodes: NodeSpec[] = [];
  const edges: GraphEdge[] = [];
  const inputNodes = new Map<string, NodeSpec>();
  const targetMap = new Map<string, TargetAccumulator>();
  const standardInputsById = new Map(
    (driverGraph.standardInputs ?? []).map((input) => [input.id, input]),
  );

  driverGraph.drivers.forEach((driver) => {
    recordDriverOutputs(
      driver,
      driver.outputs,
      nodes,
      edges,
      inputNodes,
      targetMap,
      standardInputsById,
    );
  });

  targetMap.forEach((acc, targetId) => {
    const strategy = resolveStrategy(targetId, conflictPolicy);
    const nodeId = applyBlendStrategy(
      targetId,
      acc,
      nodes,
      edges,
      strategy,
      resolveWeight,
    );
    if (!nodeId) {
      return;
    }
    const outputId = `out_${sanitizeId(targetId)}`;
    const target =
      acc.target ?? ({ id: targetId, type: "rig-input" } as RigDriverTarget);
    nodes.push({
      id: outputId,
      type: "output",
      params: {
        path: target.path ?? target.id,
      },
    });
    edges.push({
      from: { node_id: nodeId },
      to: { node_id: outputId, input: "in" },
    });
  });

  return {
    nodes,
    edges: edges.length ? edges : undefined,
  };
}
