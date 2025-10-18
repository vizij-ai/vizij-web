import type { StandardRigInput } from "../low-level/standardRigInputs";
import type {
  EmotionDefinition,
  GraphGenerationSummary,
  StandardInputId,
} from "./types";

type GraphNodeSpec = {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  input_defaults?: Record<string, unknown>;
};

type GraphLinkSpec = {
  from: { node_id: string };
  to: { node_id: string; input: string };
};

export type GraphSpec = {
  nodes: GraphNodeSpec[];
  links?: GraphLinkSpec[];
};

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildRigInputPath(faceId: string, path: string): string {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `rig/${faceId}/${trimmed}`;
}

function getNeutralValue(
  input: StandardRigInput,
  neutralInputs: Record<StandardInputId, number>,
): number {
  return neutralInputs[input.id] ?? input.defaultValue;
}

function createEmotionInputNode(emotion: EmotionDefinition): GraphNodeSpec {
  return {
    id: `emotion_${sanitizeId(emotion.id)}`,
    type: "input",
    params: {
      path: `rigging/emotions/${emotion.id}`,
      value: 0,
    },
  };
}

export function buildEmotionGraphSpec(options: {
  faceId: string | null;
  neutralInputs: Record<StandardInputId, number>;
  emotions: EmotionDefinition[];
  standardInputs: StandardRigInput[];
}): { spec: GraphSpec; summary: GraphGenerationSummary } {
  const { faceId, neutralInputs, emotions, standardInputs } = options;
  const nodes: GraphNodeSpec[] = [];
  const links: GraphLinkSpec[] = [];

  const emotionNodes = new Map<string, string>();
  emotions.forEach((emotion) => {
    const node = createEmotionInputNode(emotion);
    nodes.push(node);
    emotionNodes.set(emotion.id, node.id);
  });

  const summary: GraphGenerationSummary = {
    inputs: [],
    outputs: [],
  };

  const resolvedFaceId = faceId ?? "face";

  standardInputs.forEach((input) => {
    const neutral = getNeutralValue(input, neutralInputs);
    const neutralConstId = `neutral_${sanitizeId(input.id)}`;
    nodes.push({
      id: neutralConstId,
      type: "constant",
      params: { value: neutral },
    });

    let currentSourceId: string = neutralConstId;
    let contributionIndex = 0;
    const contributions: GraphGenerationSummary["inputs"][number]["contributions"] =
      [];

    emotions.forEach((emotion) => {
      const target = emotion.values[input.id];
      if (target === undefined) {
        return;
      }
      const delta = target - neutral;
      if (Math.abs(delta) < 1e-6) {
        return;
      }
      const deltaConstId = `delta_${sanitizeId(input.id)}_${sanitizeId(emotion.id)}`;
      nodes.push({
        id: deltaConstId,
        type: "constant",
        params: { value: delta },
      });

      const multiplierId = `mul_${sanitizeId(input.id)}_${sanitizeId(emotion.id)}`;
      nodes.push({
        id: multiplierId,
        type: "multiply",
      });
      const emotionNodeId = emotionNodes.get(emotion.id);
      if (emotionNodeId) {
        links.push({
          from: { node_id: emotionNodeId },
          to: { node_id: multiplierId, input: "a" },
        });
      }
      links.push({
        from: { node_id: deltaConstId },
        to: { node_id: multiplierId, input: "b" },
      });

      const addNodeId = `add_${sanitizeId(input.id)}_${++contributionIndex}`;
      nodes.push({
        id: addNodeId,
        type: "add",
      });
      links.push({
        from: { node_id: currentSourceId },
        to: { node_id: addNodeId, input: "lhs" },
      });
      links.push({
        from: { node_id: multiplierId },
        to: { node_id: addNodeId, input: "rhs" },
      });

      currentSourceId = addNodeId;
      contributions.push({
        emotionId: emotion.id,
        emotionName: emotion.name,
        delta,
      });
    });

    const path = buildRigInputPath(resolvedFaceId, input.path);
    const outputNodeId = `out_${sanitizeId(input.id)}`;
    nodes.push({
      id: outputNodeId,
      type: "output",
      params: {
        path,
      },
    });
    links.push({
      from: { node_id: currentSourceId },
      to: { node_id: outputNodeId, input: "in" },
    });
    summary.inputs.push({
      id: input.id,
      path,
      neutral,
      contributions,
    });
    summary.outputs.push(path);
  });

  const spec: GraphSpec = {
    nodes,
    links: links.length ? links : undefined,
  };

  return { spec, summary };
}
