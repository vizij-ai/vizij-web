import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { buildRigInputPath } from "./utils";
import type {
  PoseDefinition,
  PoseRigGraphSummary,
  StandardInputId,
} from "./types";

type EdgeSpec = NonNullable<GraphSpec["edges"]>[number];

function buildRecordValue(fields: Record<string, number>): any {
  const entries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  return {
    record: {
      values: {
        record: Object.fromEntries(
          entries.map(([key, value]) => [key, { float: value }]),
        ),
      },
    },
  };
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function sanitizePathSegment(value: string, fallback: string): string {
  const fromLabel = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (fromLabel) {
    return fromLabel;
  }
  const fromFallback = fallback
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return fromFallback || "pose";
}

function getNeutralValue(
  input: StandardRigInput,
  neutralInputs: Record<StandardInputId, number>,
): number {
  return neutralInputs[input.id] ?? 0;
}

function clampValueForInput(input: StandardRigInput, value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const { min, max } = input.range;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function createPosePathSegment(
  pose: PoseDefinition,
  usage: Map<string, number>,
): string {
  const base = sanitizePathSegment(pose.name ?? "", pose.id);
  const used = usage.get(base) ?? 0;
  usage.set(base, used + 1);
  if (used === 0) {
    return base;
  }
  return `${base}_${used + 1}`;
}

function createPoseInputNode(pose: PoseDefinition, path: string): NodeSpec {
  return {
    id: `pose_${sanitizeId(pose.id)}`,
    type: "input",
    params: {
      path,
      value: { float: 0 },
    },
  };
}

function buildPoseWeightPath(faceId: string, segment: string): string {
  return buildRigInputPath(faceId, `/poses/${segment}.weight`);
}

export function buildPoseGraphSpec(options: {
  faceId: string | null;
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  standardInputs: StandardRigInput[];
}): { spec: GraphSpec; summary: PoseRigGraphSummary } {
  const { faceId, neutralInputs, poses, standardInputs } = options;
  const nodes: NodeSpec[] = [];
  const edges: EdgeSpec[] = [];
  const trimmedFaceId = faceId?.trim();
  const faceSegment =
    trimmedFaceId && trimmedFaceId.length > 0 ? trimmedFaceId : "face";

  const posePathUsage = new Map<string, number>();
  const poseConstants = new Map<string, string>();
  const poseInputs: Array<{ pose: PoseDefinition; nodeId: string }> = [];

  poses.forEach((pose) => {
    const recordFields: Record<string, number> = {};
    standardInputs.forEach((input) => {
      const value = clampValueForInput(
        input,
        pose.values[input.id] ?? neutralInputs[input.id] ?? 0,
      );
      recordFields[input.id] = value;
    });
    const nodeId = `pose_record_${sanitizeId(pose.id)}`;
    nodes.push({
      id: nodeId,
      type: "constant",
      params: {
        value: buildRecordValue(recordFields),
      },
    });
    poseConstants.set(pose.id, nodeId);

    const pathSegment = createPosePathSegment(pose, posePathUsage);
    const poseWeightPath = buildPoseWeightPath(faceSegment, pathSegment);
    const inputNode = createPoseInputNode(pose, poseWeightPath);
    nodes.push(inputNode);
    poseInputs.push({ pose, nodeId: inputNode.id });
  });

  const weightsJoinId = poses.length ? "pose_weights_join" : null;
  if (weightsJoinId) {
    nodes.push({
      id: weightsJoinId,
      type: "join",
    });
    poseInputs.forEach((entry, index) => {
      edges.push({
        from: { node_id: entry.nodeId },
        to: { node_id: weightsJoinId, input: `operand_${index + 1}` },
      });
    });
  }

  const neutralRecordFields: Record<string, number> = {};
  const zeroRecordFields: Record<string, number> = {};
  standardInputs.forEach((input) => {
    const value = clampValueForInput(input, neutralInputs[input.id] ?? 0);
    neutralRecordFields[input.id] = value;
    zeroRecordFields[input.id] = 0;
  });

  const neutralNodeId = "pose_neutral_record";
  nodes.push({
    id: neutralNodeId,
    type: "constant",
    params: {
      value: buildRecordValue(neutralRecordFields),
    },
  });

  const offsetNodeId = "pose_offset_zero";
  nodes.push({
    id: offsetNodeId,
    type: "constant",
    params: {
      value: buildRecordValue(zeroRecordFields),
    },
  });

  const blendNodeId = "pose_blend";
  nodes.push({
    id: blendNodeId,
    type: "default-blend",
  });

  edges.push({
    from: { node_id: neutralNodeId },
    to: { node_id: blendNodeId, input: "baseline" },
  });
  edges.push({
    from: { node_id: offsetNodeId },
    to: { node_id: blendNodeId, input: "offset" },
  });

  if (weightsJoinId) {
    edges.push({
      from: { node_id: weightsJoinId },
      to: { node_id: blendNodeId, input: "weights" },
    });
  }

  poses.forEach((pose, index) => {
    const poseNodeId = poseConstants.get(pose.id);
    if (!poseNodeId) {
      return;
    }
    edges.push({
      from: { node_id: poseNodeId },
      to: { node_id: blendNodeId, input: `operand_${index + 1}` },
    });
  });

  const summary: PoseRigGraphSummary = {
    inputs: [],
    outputs: [],
  };

  standardInputs.forEach((input) => {
    const neutral = getNeutralValue(input, neutralInputs);
    const neutralValue = clampValueForInput(input, neutral);

    const contributions: PoseRigGraphSummary["inputs"][number]["contributions"] =
      [];

    poses.forEach((pose) => {
      const poseValueRaw = pose.values[input.id];
      const poseValue = clampValueForInput(
        input,
        poseValueRaw === undefined ? neutralValue : poseValueRaw,
      );
      const delta = poseValue - neutralValue;
      if (Math.abs(delta) >= 1e-6) {
        contributions.push({
          poseId: pose.id,
          poseName: pose.name,
          value: poseValue,
          delta,
        });
      }
    });

    if (contributions.length === 0) {
      return;
    }

    const path = input.path;
    const typedPath = buildRigInputPath(faceSegment, path);
    const outputNodeId = `out_${sanitizeId(input.id)}`;
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: { path: typedPath },
    });
    edges.push({
      from: { node_id: "pose_blend" },
      to: { node_id: outputNodeId, input: "in" },
      selector: [{ field: "values" }, { field: input.id }],
    });
    summary.inputs.push({
      id: input.id,
      path,
      neutral: neutralValue,
      contributions,
    });
    summary.outputs.push(path);
  });

  const spec: GraphSpec = {
    nodes,
    edges: edges.length ? edges : undefined,
  };

  return { spec, summary };
}
