import {
  type LowLevelRigDefinition,
  type LowLevelRigChannelDefinition,
  type LowLevelRigTrackDefinition,
} from "@vizij/config";
import type { RawValue } from "@vizij/utils";

import type {
  AnimatableListGroup,
  AnimatableListItem,
  GraphEditorState,
  GraphNodeState,
  ValueKind,
} from "../types";

export type RigGraphResult = {
  graph: GraphEditorState;
  outputNodeToAnimId: Record<string, string>;
};

const AXES: Array<"x" | "y" | "z"> = ["x", "y", "z"];

const TRACK_DEFAULT_INPUT: Record<string, number> = {
  pos: 0,
  rotation: 0,
  rot: 0,
  scale: 1,
  morph: 0,
};

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function coerceNumber(value: RawValue | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function coerceVec3(value: RawValue | undefined): {
  x: number;
  y: number;
  z: number;
} {
  if (value && typeof value === "object") {
    const arr = Array.isArray(value) ? (value as RawValue[]) : null;
    const record = !arr ? (value as unknown as Record<string, RawValue>) : null;
    return {
      x: coerceNumber(record?.x ?? arr?.[0], 0),
      y: coerceNumber(record?.y ?? arr?.[1], 0),
      z: coerceNumber(record?.z ?? arr?.[2], 0),
    };
  }
  return { x: 0, y: 0, z: 0 };
}

function coerceVec3ForScale(value: RawValue | undefined): {
  x: number;
  y: number;
  z: number;
} {
  if (value && typeof value === "object") {
    const arr = Array.isArray(value) ? (value as RawValue[]) : null;
    const record = !arr ? (value as unknown as Record<string, RawValue>) : null;
    return {
      x: coerceNumber(record?.x ?? arr?.[0], 1),
      y: coerceNumber(record?.y ?? arr?.[1], 1),
      z: coerceNumber(record?.z ?? arr?.[2], 1),
    };
  }
  return { x: 1, y: 1, z: 1 };
}

function parseScaleVector(track: LowLevelRigTrackDefinition | undefined): {
  x: number;
  y: number;
  z: number;
} {
  if (!track || !track.mapFunc) {
    return { x: 1, y: 1, z: 1 };
  }

  const src = track.mapFunc.toString();
  const matchX = src.match(/x:\s*(-?\d+(?:\.\d+)?)/);
  const matchY = src.match(/y:\s*(-?\d+(?:\.\d+)?)/);
  const matchZ = src.match(/z:\s*(-?\d+(?:\.\d+)?)/);

  return {
    x: matchX ? Number.parseFloat(matchX[1]) : 1,
    y: matchY ? Number.parseFloat(matchY[1]) : 1,
    z: matchZ ? Number.parseFloat(matchZ[1]) : 1,
  };
}

function resolveTrackKind(trackName: string): string {
  const lower = trackName.toLowerCase();
  if (lower === "pos" || lower === "position") return "pos";
  if (lower === "rot" || lower === "rotation") return "rot";
  if (lower === "scale") return "scale";
  if (lower === "morph") return "morph";
  return lower;
}

function buildSearchKey(
  channel: LowLevelRigChannelDefinition,
  trackName: string,
  track: LowLevelRigTrackDefinition,
): string {
  const shapeKey = channel.shapeKey;
  const kind = resolveTrackKind(trackName);

  switch (kind) {
    case "morph":
      return `${shapeKey} Key ${track.key ?? "1"}`;
    case "pos":
      return `${shapeKey} translation`;
    case "rot":
      return `${shapeKey} rotation`;
    case "scale":
      return `${shapeKey} scale`;
    default:
      return `${shapeKey} ${trackName}`;
  }
}

function flattenAnimatables(
  groups: AnimatableListGroup[],
): AnimatableListItem[] {
  const items: AnimatableListItem[] = [];
  groups.forEach((group) => {
    group.items.forEach((item) => items.push(item));
  });
  return items;
}

function toValueKind(type: string | undefined, fallback: ValueKind): ValueKind {
  if (!type) return fallback;
  const lower = type.toLowerCase();
  if (lower.includes("vec3")) return "vec3";
  if (lower.includes("vec2")) return "vec2";
  if (lower.includes("vec4")) return "vec4";
  if (lower.includes("quat")) return "quat";
  if (lower.includes("color")) return "color";
  if (lower.includes("float") || lower.includes("scalar")) return "float";
  if (lower.includes("bool")) return "bool";
  if (lower.includes("vector")) return "vector";
  return fallback;
}

function makeInputNode(options: {
  id: string;
  name: string;
  path: string;
  defaultValue: number | number[];
  kind: ValueKind;
}): GraphNodeState {
  return {
    id: options.id,
    type: "input",
    name: options.name,
    category: "Rig",
    params: [
      { id: "path", label: "Path", type: "custom", value: options.path },
      {
        id: "value",
        label: "Default",
        type: options.kind,
        value: options.defaultValue,
      },
    ],
    inputs: {},
  };
}

function makeConstantNode(options: {
  id: string;
  name: string;
  value: number | number[];
  kind: ValueKind;
  category?: string;
}): GraphNodeState {
  return {
    id: options.id,
    type: "constant",
    name: options.name,
    category: options.category ?? "Math",
    params: [
      { id: "value", label: "Value", type: options.kind, value: options.value },
    ],
    inputs: {},
  };
}

function makeBinaryNode(options: {
  id: string;
  type: "add" | "multiply";
  name: string;
  inputKeys: string[];
}): GraphNodeState {
  const inputs: Record<string, string> = {};
  options.inputKeys.forEach((sourceId, index) => {
    inputs[`operands_${index + 1}`] = sourceId;
  });
  return {
    id: options.id,
    type: options.type,
    name: options.name,
    category: "Math",
    params: [],
    inputs,
  };
}

function makeJoinNode(options: {
  id: string;
  sources: string[];
  name: string;
}): GraphNodeState {
  const inputs: Record<string, string> = {};
  options.sources.forEach((sourceId, index) => {
    inputs[`operands_${index + 1}`] = sourceId;
  });
  return {
    id: options.id,
    type: "join",
    name: options.name,
    category: "Vectors",
    params: [],
    inputs,
  };
}

function makeOutputNode(options: {
  id: string;
  sourceId: string;
  path: string;
  name: string;
  kind: ValueKind;
}): GraphNodeState {
  return {
    id: options.id,
    type: "output",
    name: options.name,
    category: "Rig",
    params: [
      { id: "path", label: "Path", type: "custom", value: options.path },
    ],
    inputs: { in: options.sourceId },
    outputValueKind: options.kind,
  };
}

function makeVectorConstantNode(options: {
  id: string;
  name: string;
  value: [number, number, number];
  category?: string;
}): GraphNodeState {
  return {
    id: options.id,
    type: "vectorconstant",
    name: options.name,
    category: options.category ?? "Vectors",
    params: [
      {
        id: "value",
        label: "Value",
        type: "vector",
        value: options.value,
      },
    ],
    inputs: {},
  };
}

function makeVectorBinaryNode(options: {
  id: string;
  type: "vectoradd" | "vectormultiply" | "vectorsubtract";
  name: string;
  leftId: string;
  rightId: string;
}): GraphNodeState {
  return {
    id: options.id,
    type: options.type,
    name: options.name,
    category: "Vectors",
    params: [],
    inputs: {
      a: options.leftId,
      b: options.rightId,
    },
  };
}

function ensureAxis(axis: string | undefined): "x" | "y" | "z" | null {
  if (!axis) return null;
  if (axis.startsWith("x")) return "x";
  if (axis.startsWith("y")) return "y";
  if (axis.startsWith("z")) return "z";
  return null;
}

function collectTrackAxes(
  track: LowLevelRigTrackDefinition,
  trackKind: string,
): Array<"x" | "y" | "z"> {
  if (Array.isArray(track.axis) && track.axis.length > 0) {
    const mapped = track.axis
      .map((axis) => ensureAxis(axis))
      .filter((axis): axis is "x" | "y" | "z" => axis !== null);
    if (mapped.length > 0) {
      return mapped;
    }
  }
  if (trackKind === "pos" || trackKind === "rot" || trackKind === "scale") {
    return ["x", "y", "z"];
  }
  return [];
}

function buildTrackNodes(options: {
  faceId: string;
  channelName: string;
  channel: LowLevelRigChannelDefinition;
  trackName: string;
  track: LowLevelRigTrackDefinition;
  animatable: AnimatableListItem;
}): {
  nodes: GraphNodeState[];
  outputNodeId: string;
  inputPaths: string[];
  outputPath: string;
} | null {
  const trackKind = resolveTrackKind(options.trackName);
  const animDefault = options.animatable.defaultValue;
  const animId = options.animatable.id;
  const scaleVec = parseScaleVector(options.track);

  const nodes: GraphNodeState[] = [];
  const inputPaths: string[] = [];

  const baseVec =
    trackKind === "scale"
      ? coerceVec3ForScale(animDefault)
      : coerceVec3(animDefault);
  const axes = collectTrackAxes(options.track, trackKind);

  if (trackKind === "morph") {
    const inputId = sanitizeId(
      `${options.channelName}_${options.trackName}_input`,
    );
    const inputPath = `rig/${options.faceId}/${options.channelName}/${options.trackName}`;
    nodes.push(
      makeInputNode({
        id: inputId,
        name: `${options.channelName} ${options.trackName}`,
        path: inputPath,
        defaultValue: TRACK_DEFAULT_INPUT[trackKind] ?? 0,
        kind: "float",
      }),
    );
    inputPaths.push(inputPath);

    const baseId = sanitizeId(
      `${options.channelName}_${options.trackName}_base`,
    );
    nodes.push(
      makeConstantNode({
        id: baseId,
        name: `${options.channelName} ${options.trackName} Base`,
        value: coerceNumber(animDefault, 0),
        kind: "float",
        category: "Rig",
      }),
    );

    const addId = sanitizeId(`${options.channelName}_${options.trackName}_sum`);
    nodes.push(
      makeBinaryNode({
        id: addId,
        name: `${options.channelName} morph`,
        type: "add",
        inputKeys: [inputId, baseId],
      }),
    );

    const outputId = sanitizeId(
      `${options.channelName}_${options.trackName}_out`,
    );
    nodes.push(
      makeOutputNode({
        id: outputId,
        name: `${options.channelName} ${options.trackName} Output`,
        sourceId: addId,
        path: animId,
        kind: "float",
      }),
    );

    return { nodes, outputNodeId: outputId, inputPaths, outputPath: animId };
  }

  const axisNodes: string[] = [];
  const fallbackValue = trackKind === "scale" ? 1 : 0;

  AXES.forEach((axis) => {
    const axisLabel = `${options.channelName} ${options.trackName} ${axis.toUpperCase()}`;
    if (axes.includes(axis)) {
      const inputPath = `rig/${options.faceId}/${options.channelName}/${options.trackName}/${axis}`;
      const inputId = sanitizeId(
        `${options.channelName}_${options.trackName}_${axis}_input`,
      );
      nodes.push(
        makeInputNode({
          id: inputId,
          name: axisLabel,
          path: inputPath,
          defaultValue: TRACK_DEFAULT_INPUT[trackKind] ?? 0,
          kind: "float",
        }),
      );
      inputPaths.push(inputPath);
      axisNodes.push(inputId);
    } else {
      const fallbackId = sanitizeId(
        `${options.channelName}_${options.trackName}_${axis}_fallback`,
      );
      nodes.push(
        makeConstantNode({
          id: fallbackId,
          name: `${axisLabel} Fallback`,
          value: fallbackValue,
          kind: "float",
          category: "Rig",
        }),
      );
      axisNodes.push(fallbackId);
    }
  });

  const joinId = sanitizeId(`${options.channelName}_${options.trackName}_join`);
  nodes.push(
    makeJoinNode({
      id: joinId,
      name: `${options.channelName} ${options.trackName} Inputs`,
      sources: axisNodes,
    }),
  );

  let vectorId = joinId;
  const scaleVectorArray: [number, number, number] = [
    scaleVec.x,
    scaleVec.y,
    scaleVec.z,
  ];
  const requiresScale = scaleVectorArray.some(
    (component) => Math.abs(component - 1) > 1e-4,
  );

  if (requiresScale) {
    const scaleConstId = sanitizeId(
      `${options.channelName}_${options.trackName}_scale_vec`,
    );
    nodes.push(
      makeVectorConstantNode({
        id: scaleConstId,
        name: `${options.channelName} ${options.trackName} Scale Vec`,
        value: scaleVectorArray,
        category: "Rig",
      }),
    );
    const scaledId = sanitizeId(
      `${options.channelName}_${options.trackName}_scaled_vec`,
    );
    nodes.push(
      makeVectorBinaryNode({
        id: scaledId,
        type: "vectormultiply",
        name: `${options.channelName} ${options.trackName} Scaled`,
        leftId: vectorId,
        rightId: scaleConstId,
      }),
    );
    vectorId = scaledId;
  }

  const baseVectorArray: [number, number, number] = [
    baseVec.x,
    baseVec.y,
    baseVec.z,
  ];
  const baseConstId = sanitizeId(
    `${options.channelName}_${options.trackName}_base_vec`,
  );
  nodes.push(
    makeVectorConstantNode({
      id: baseConstId,
      name: `${options.channelName} ${options.trackName} Base Vec`,
      value: baseVectorArray,
      category: "Rig",
    }),
  );

  let resultVectorId: string;
  if (trackKind === "scale") {
    const multiplyId = sanitizeId(
      `${options.channelName}_${options.trackName}_with_base`,
    );
    nodes.push(
      makeVectorBinaryNode({
        id: multiplyId,
        type: "vectormultiply",
        name: `${options.channelName} ${options.trackName} * Base`,
        leftId: vectorId,
        rightId: baseConstId,
      }),
    );
    resultVectorId = multiplyId;
  } else {
    const addId = sanitizeId(
      `${options.channelName}_${options.trackName}_with_base`,
    );
    nodes.push(
      makeVectorBinaryNode({
        id: addId,
        type: "vectoradd",
        name: `${options.channelName} ${options.trackName} + Base`,
        leftId: vectorId,
        rightId: baseConstId,
      }),
    );
    resultVectorId = addId;
  }

  const outputId = sanitizeId(
    `${options.channelName}_${options.trackName}_out`,
  );
  const valueKind = toValueKind(options.animatable.type, "vector");
  nodes.push(
    makeOutputNode({
      id: outputId,
      name: `${options.channelName} ${options.trackName} Output`,
      sourceId: resultVectorId,
      path: animId,
      kind: valueKind,
    }),
  );

  return {
    nodes,
    outputNodeId: outputId,
    inputPaths,
    outputPath: animId,
  };
}

export function buildRigGraph(
  faceId: string,
  rig: LowLevelRigDefinition,
  groups: AnimatableListGroup[],
): RigGraphResult | null {
  const items = flattenAnimatables(groups);
  if (!items.length) {
    return null;
  }
  const nameLookup = new Map(items.map((item) => [item.name, item]));

  const nodes: GraphNodeState[] = [];
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  const outputNodeToAnimId: Record<string, string> = {};

  Object.entries(rig.channels).forEach(([channelName, channel]) => {
    Object.entries(channel.tracks).forEach(([trackName, track]) => {
      const key = buildSearchKey(channel, trackName, track);
      const anim = nameLookup.get(key);
      if (!anim) {
        return;
      }
      const trackNodes = buildTrackNodes({
        faceId,
        channelName,
        channel,
        trackName,
        track,
        animatable: anim,
      });
      if (!trackNodes) {
        return;
      }
      trackNodes.nodes.forEach((node) => nodes.push(node));
      trackNodes.inputPaths.forEach((path) => inputs.add(path));
      outputs.add(trackNodes.outputPath);
      outputNodeToAnimId[trackNodes.outputNodeId] = trackNodes.outputPath;
    });
  });

  if (!nodes.length) {
    return null;
  }

  const graph: GraphEditorState = {
    nodes,
    inputs: Array.from(inputs),
    outputs: Array.from(outputs),
  };

  return { graph, outputNodeToAnimId };
}
