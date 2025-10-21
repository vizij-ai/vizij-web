import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "../low-level/standardRigInputs";
import { buildRigInputPath } from "./utils";
import type {
  EmotionDefinition,
  GraphGenerationSummary,
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
  return fromFallback || "emotion";
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

function createEmotionPathSegment(
  emotion: EmotionDefinition,
  usage: Map<string, number>,
): string {
  const base = sanitizePathSegment(emotion.name ?? "", emotion.id);
  const used = usage.get(base) ?? 0;
  usage.set(base, used + 1);
  if (used === 0) {
    return base;
  }
  return `${base}_${used + 1}`;
}

function createEmotionInputNode(
  emotion: EmotionDefinition,
  path: string,
): NodeSpec {
  return {
    id: `emotion_${sanitizeId(emotion.id)}`,
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
  emotions: EmotionDefinition[];
  standardInputs: StandardRigInput[];
}): { spec: GraphSpec; summary: GraphGenerationSummary } {
  const { faceId, neutralInputs, emotions, standardInputs } = options;
  const nodes: NodeSpec[] = [];
  const edges: EdgeSpec[] = [];
  const trimmedFaceId = faceId?.trim();
  const faceSegment =
    trimmedFaceId && trimmedFaceId.length > 0 ? trimmedFaceId : "face";

  const emotionPathUsage = new Map<string, number>();
  const poseConstants = new Map<string, string>();
  const emotionInputs: Array<{ emotion: EmotionDefinition; nodeId: string }> =
    [];

  emotions.forEach((emotion) => {
    const recordFields: Record<string, number> = {};
    standardInputs.forEach((input) => {
      const value = clampValueForInput(
        input,
        emotion.values[input.id] ?? neutralInputs[input.id] ?? 0,
      );
      recordFields[input.id] = value;
    });
    const nodeId = `pose_record_${sanitizeId(emotion.id)}`;
    nodes.push({
      id: nodeId,
      type: "constant",
      params: {
        value: buildRecordValue(recordFields),
      },
    });
    poseConstants.set(emotion.id, nodeId);

    const pathSegment = createEmotionPathSegment(emotion, emotionPathUsage);
    const poseWeightPath = buildPoseWeightPath(faceSegment, pathSegment);
    const inputNode = createEmotionInputNode(emotion, poseWeightPath);
    nodes.push(inputNode);
    emotionInputs.push({ emotion, nodeId: inputNode.id });
  });

  const weightsJoinId = emotions.length ? "pose_weights_join" : null;
  if (weightsJoinId) {
    nodes.push({
      id: weightsJoinId,
      type: "join",
    });
    emotionInputs.forEach((entry, index) => {
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

  emotions.forEach((emotion, index) => {
    const poseNodeId = poseConstants.get(emotion.id);
    if (!poseNodeId) {
      return;
    }
    edges.push({
      from: { node_id: poseNodeId },
      to: { node_id: blendNodeId, input: `operand_${index + 1}` },
    });
  });

  const summary: GraphGenerationSummary = {
    inputs: [],
    outputs: [],
  };

  standardInputs.forEach((input) => {
    const neutral = getNeutralValue(input, neutralInputs);
    const neutralValue = clampValueForInput(input, neutral);

    const contributions: GraphGenerationSummary["inputs"][number]["contributions"] =
      [];

    emotions.forEach((emotion) => {
      const poseValueRaw = emotion.values[input.id];
      const poseValue = clampValueForInput(
        input,
        poseValueRaw === undefined ? neutralValue : poseValueRaw,
      );
      const delta = poseValue - neutralValue;
      if (Math.abs(delta) >= 1e-6) {
        contributions.push({
          emotionId: emotion.id,
          emotionName: emotion.name,
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
      path: path,
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
