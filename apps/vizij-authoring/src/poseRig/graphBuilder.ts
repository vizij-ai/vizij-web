import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseWeightPathMap, buildRigInputPath } from "./utils";
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

function getNeutralValue(
  input: StandardRigInput,
  neutralInputs: Record<StandardInputId, number>,
): number {
  const stored = neutralInputs[input.id];
  if (stored !== undefined) {
    return stored;
  }
  const fallback = Number.isFinite(input.defaultValue) ? input.defaultValue : 0;
  return fallback;
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

export function buildPoseGraphSpec(options: {
  faceId: string | null;
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  standardInputs: StandardRigInput[];
  blendMode?: "average" | "additive";
  poseGroupSegment?: string | null;
  rigKind?: "generic" | "face-specific";
}): { spec: GraphSpec; summary: PoseRigGraphSummary } {
  const { faceId, neutralInputs, poses, standardInputs, poseGroupSegment } =
    options;
  const nodes: NodeSpec[] = [];
  const edges: EdgeSpec[] = [];
  const trimmedFaceId = faceId?.trim();
  const faceSegment =
    options.rigKind === "generic"
      ? "standard"
      : trimmedFaceId && trimmedFaceId.length > 0
        ? trimmedFaceId
        : "face";

  const poseWeightPathMap = buildPoseWeightPathMap(poses, faceId, {
    baseSegment: poseGroupSegment ?? undefined,
  });
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

    const poseWeightPath =
      poseWeightPathMap.get(pose.id)?.absolutePath ??
      buildRigInputPath(faceSegment, `/poses/${sanitizeId(pose.id)}.weight`);
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
  standardInputs.forEach((input) => {
    const value = clampValueForInput(input, neutralInputs[input.id] ?? 0);
    neutralRecordFields[input.id] = value;
  });

  const neutralNodeId = "pose_neutral_record";
  nodes.push({
    id: neutralNodeId,
    type: "constant",
    params: {
      value: buildRecordValue(neutralRecordFields),
    },
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

    const deltas: number[] = [];
    const masks: number[] = [];

    poses.forEach((pose) => {
      const poseValueRaw = pose.values[input.id];
      const poseValue = clampValueForInput(
        input,
        poseValueRaw === undefined ? neutralValue : poseValueRaw,
      );
      const delta = poseValue - neutralValue;
      const isActive = Math.abs(delta) >= 1e-6;
      deltas.push(delta);
      masks.push(isActive ? 1 : 0);
      if (isActive) {
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

    const deltaNodeId = `pose_delta_${sanitizeId(input.id)}`;
    nodes.push({
      id: deltaNodeId,
      type: "constant",
      params: {
        value: { vector: deltas },
      },
    });

    const maskNodeId = `pose_mask_${sanitizeId(input.id)}`;
    nodes.push({
      id: maskNodeId,
      type: "constant",
      params: {
        value: { vector: masks },
      },
    });

    const wsNodeId = `pose_ws_${sanitizeId(input.id)}`;
    nodes.push({
      id: wsNodeId,
      type: "weightedsumvector",
    });

    edges.push({
      from: { node_id: deltaNodeId },
      to: { node_id: wsNodeId, input: "values" },
    });
    if (weightsJoinId) {
      edges.push({
        from: { node_id: weightsJoinId },
        to: { node_id: wsNodeId, input: "weights" },
      });
    }
    edges.push({
      from: { node_id: maskNodeId },
      to: { node_id: wsNodeId, input: "masks" },
    });

    const mode = options.blendMode ?? "average";
    if (mode === "additive") {
      const addNodeId = `pose_add_${sanitizeId(input.id)}`;
      nodes.push({
        id: addNodeId,
        type: "add",
      });
      edges.push(
        {
          from: { node_id: wsNodeId, output: "total_weighted_sum" },
          to: { node_id: addNodeId, input: "a" },
        },
        {
          from: { node_id: neutralNodeId },
          to: { node_id: addNodeId, input: "b" },
          selector: [{ field: "values" }, { field: input.id }],
        },
        {
          from: { node_id: addNodeId },
          to: { node_id: outputNodeId, input: "in" },
        },
      );
    } else {
      const overlayNodeId = `pose_overlay_${sanitizeId(input.id)}`;
      nodes.push({
        id: overlayNodeId,
        type: "blendweightedaverageoverlay",
      });
      edges.push(
        {
          from: { node_id: wsNodeId, output: "total_weighted_sum" },
          to: { node_id: overlayNodeId, input: "total_weighted_sum" },
        },
        {
          from: { node_id: wsNodeId, output: "total_weight" },
          to: { node_id: overlayNodeId, input: "total_weight" },
        },
        {
          from: { node_id: wsNodeId, output: "max_effective_weight" },
          to: { node_id: overlayNodeId, input: "max_effective_weight" },
        },
        {
          from: { node_id: neutralNodeId },
          to: { node_id: overlayNodeId, input: "base" },
          selector: [{ field: "values" }, { field: input.id }],
        },
        {
          from: { node_id: overlayNodeId },
          to: { node_id: outputNodeId, input: "in" },
        },
      );
    }

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
