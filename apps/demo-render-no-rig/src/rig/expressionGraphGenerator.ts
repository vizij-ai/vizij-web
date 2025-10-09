import {
  BASIC_EMOTIONS,
  getFaceExpressionConfig,
  type BasicEmotion,
} from "./expressionPresets";
import type { GraphEditorState, GraphNodeState } from "../types";

type EmotionInputMap = Record<BasicEmotion, string>;

type ExpressionGraphBuildResult = {
  nodes: GraphNodeState[];
  inputs: Set<string>;
  outputs: Set<string>;
};

const ZERO = 0;

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

function humanizePath(path: string): string {
  const parts = path.split("/");
  const last = parts[parts.length - 1] ?? path;
  return capitalize(last.replace(/_/g, " "));
}

function makeEmotionInputNodes(
  result: ExpressionGraphBuildResult,
): EmotionInputMap {
  const ids = {} as EmotionInputMap;
  BASIC_EMOTIONS.forEach((emotion) => {
    const id = sanitizeId(`emotion_${emotion}_input`);
    const path = `emotion/${emotion}`;
    const node: GraphNodeState = {
      id,
      type: "input",
      name: `${capitalize(emotion)} Weight`,
      category: "Emotions",
      params: [
        { id: "path", label: "Path", type: "custom", value: path },
        { id: "value", label: "Default", type: "float", value: 0 },
      ],
      inputs: {},
    };
    result.nodes.push(node);
    result.inputs.add(path);
    ids[emotion] = id;
  });
  return ids;
}

function makeConstantNode(
  id: string,
  name: string,
  value: number,
  category: string,
): GraphNodeState {
  return {
    id,
    type: "constant",
    name,
    category,
    params: [{ id: "value", label: "Value", type: "float", value }],
    inputs: {},
  };
}

function makeJoinNode(
  id: string,
  name: string,
  sources: string[],
): GraphNodeState {
  const inputs: Record<string, string> = {};
  sources.forEach((sourceId, index) => {
    inputs[`operands_${index + 1}`] = sourceId;
  });
  return {
    id,
    type: "join",
    name,
    category: "Emotions",
    params: [],
    inputs,
  };
}

function makeOutputNode(
  id: string,
  name: string,
  sourceId: string,
  path: string,
): GraphNodeState {
  return {
    id,
    type: "output",
    name,
    category: "Rig",
    params: [{ id: "path", label: "Path", type: "custom", value: path }],
    inputs: { in: sourceId },
    outputValueKind: "float",
  };
}

export function buildExpressionGraph(faceId: string): GraphEditorState | null {
  const config = getFaceExpressionConfig(faceId);
  if (!config) {
    return null;
  }

  const result: ExpressionGraphBuildResult = {
    nodes: [],
    inputs: new Set<string>(),
    outputs: new Set<string>(),
  };

  const emotionInputs = makeEmotionInputNodes(result);
  const weightsJoinId = "emotion_weights_join";
  result.nodes.push(
    makeJoinNode(
      weightsJoinId,
      "Emotion Weights",
      BASIC_EMOTIONS.map((emotion) => emotionInputs[emotion]),
    ),
  );

  const zeroOffsetId = "emotion_zero_offset";
  result.nodes.push(
    makeConstantNode(zeroOffsetId, "Emotion Offset", ZERO, "Emotions"),
  );

  const baselineMap = new Map<string, number>();
  const pathOrder: string[] = [];

  config.baseline.forEach(({ path, value }) => {
    if (!baselineMap.has(path)) {
      pathOrder.push(path);
    }
    baselineMap.set(path, value);
  });

  const emotionValueMap = new Map<BasicEmotion, Map<string, number>>();
  config.emotions.forEach((preset) => {
    const poseMap = new Map<string, number>();
    preset.poses.forEach(({ path, value }) => {
      poseMap.set(path, value);
      if (!baselineMap.has(path)) {
        baselineMap.set(path, 0);
        pathOrder.push(path);
      }
    });
    emotionValueMap.set(preset.target, poseMap);
  });

  BASIC_EMOTIONS.forEach((emotion) => {
    if (!emotionValueMap.has(emotion)) {
      emotionValueMap.set(emotion, new Map());
    }
  });

  const allPaths = pathOrder.length
    ? pathOrder
    : Array.from(new Set(baselineMap.keys()));

  if (!allPaths.length) {
    return null;
  }

  allPaths.forEach((path) => {
    const baseValue = baselineMap.get(path) ?? 0;
    const baseId = sanitizeId(`${path}_base`);
    result.nodes.push(
      makeConstantNode(
        baseId,
        `${humanizePath(path)} Base`,
        baseValue,
        "Emotions",
      ),
    );

    const targetIds: string[] = [];
    BASIC_EMOTIONS.forEach((emotion, index) => {
      const targetValue = emotionValueMap.get(emotion)?.get(path) ?? baseValue;
      const targetId = sanitizeId(`${path}_${emotion}_target`);
      result.nodes.push(
        makeConstantNode(
          targetId,
          `${capitalize(emotion)} Target`,
          targetValue,
          "Emotions",
        ),
      );
      targetIds[index] = targetId;
    });

    const blendInputs: Record<string, string> = {
      baseline: baseId,
      offset: zeroOffsetId,
      weights: weightsJoinId,
    };
    targetIds.forEach((targetId, index) => {
      blendInputs[`target_${index + 1}`] = targetId;
    });

    const blendId = sanitizeId(`${path}_default_blend`);
    result.nodes.push({
      id: blendId,
      type: "default-blend",
      name: `${humanizePath(path)} Blend`,
      category: "Emotions",
      params: [],
      inputs: blendInputs,
    });

    const outputId = sanitizeId(`${path}_output`);
    const outputName = `Rig ${humanizePath(path)}`;
    result.nodes.push(makeOutputNode(outputId, outputName, blendId, path));
    result.outputs.add(path);
  });

  return {
    nodes: result.nodes,
    inputs: Array.from(result.inputs),
    outputs: Array.from(result.outputs),
  };
}
