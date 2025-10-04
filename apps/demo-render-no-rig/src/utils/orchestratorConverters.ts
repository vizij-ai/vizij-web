import type {
  AnimationRegistrationConfig,
  GraphRegistrationInput,
  ValueJSON,
} from "@vizij/orchestrator-react";
import type {
  AnimationEditorState,
  AnimationTrackState,
  GraphEditorState,
  GraphNodeState,
  GraphParamState,
  ValueKind,
} from "../types";
import { valueToJSON } from "./valueHelpers";

function normalizeForGraph(kind: ValueKind, value: any): ValueJSON {
  return valueToJSON(kind, value);
}

function parseShapeJson(shape?: string): any | undefined {
  if (!shape) return undefined;
  try {
    return JSON.parse(shape);
  } catch {
    return undefined;
  }
}

function wrapShape(
  id: string,
  data?: Record<string, any>,
  meta?: Record<string, string>,
) {
  const payload: Record<string, any> = { id: { id } };
  if (data && Object.keys(data).length > 0) {
    payload.id.data = data;
  }
  payload.meta = meta ?? {};
  return payload;
}

function normalizeParsedShape(
  parsed: Record<string, any>,
): Record<string, any> | undefined {
  if (
    parsed.id &&
    typeof parsed.id === "object" &&
    typeof parsed.id.id === "string"
  ) {
    // Already in the expected nested format
    if (!parsed.meta || typeof parsed.meta !== "object") {
      parsed.meta = {};
    }
    return parsed;
  }
  if (typeof parsed.id === "string") {
    const data = typeof parsed.data === "object" ? parsed.data : undefined;
    const meta =
      typeof parsed.meta === "object"
        ? (parsed.meta as Record<string, string>)
        : {};
    return wrapShape(parsed.id, data, meta);
  }
  return undefined;
}

function shapeForValueKind(
  kind: ValueKind,
  shapeJson?: string,
): Record<string, any> | undefined {
  const parsed = parseShapeJson(shapeJson);
  if (parsed && typeof parsed === "object") {
    const normalized = normalizeParsedShape(parsed as Record<string, any>);
    if (normalized) {
      return normalized;
    }
  }
  switch (kind) {
    case "float":
      return wrapShape("Scalar");
    case "bool":
      return wrapShape("Bool");
    case "vec2":
      return wrapShape("Vec2");
    case "vec3":
      return wrapShape("Vec3");
    case "vec4":
      return wrapShape("Vec4");
    case "quat":
      return wrapShape("Quat");
    case "color":
      return wrapShape("ColorRgba");
    case "transform":
      return wrapShape("Transform");
    case "vector":
      return wrapShape("Vector");
    default:
      return undefined;
  }
}

function convertTrack(track: AnimationTrackState): any {
  const converted: Record<string, unknown> = {
    id: track.id,
    name: track.name,
    animatableId: track.animatableId,
    points: track.keyframes
      .slice()
      .sort((a, b) => a.stamp - b.stamp)
      .map((key) => {
        const base: any = {
          id: key.id,
          stamp: key.stamp,
          value: valueToJSON(track.valueKind, key.value) as ValueJSON,
        };
        if (key.handleIn) {
          base.handleIn = { x: key.handleIn.x, y: key.handleIn.y };
        }
        if (key.handleOut) {
          base.handleOut = { x: key.handleOut.x, y: key.handleOut.y };
        }
        return base;
      }),
  };
  if (track.shapeJson) {
    converted.shape = parseShapeJson(track.shapeJson);
  }
  if (track.valueKind) {
    converted.valueType = track.valueKind;
  }
  if (track.optionId) {
    converted.optionId = track.optionId;
  }
  if (track.componentKey) {
    converted.componentKey = track.componentKey;
  }
  return converted;
}

export function animationStateToConfig(
  state: AnimationEditorState,
): AnimationRegistrationConfig {
  return {
    setup: {
      animation: {
        id: state.id,
        name: state.name,
        duration: state.duration,
        groups: [],
        tracks: state.tracks.map(convertTrack),
      },
      player: {
        name: state.playerName,
        loop_mode: state.loopMode,
        speed: state.speed,
      },
    },
  };
}

function convertParamValue(type: ValueKind, value: any): ValueJSON {
  return normalizeForGraph(type, value);
}

const FLOAT_PARAM_IDS = new Set([
  "min",
  "max",
  "frequency",
  "phase",
  "x",
  "y",
  "z",
  "in_min",
  "in_max",
  "out_min",
  "out_max",
  "bone1",
  "bone2",
  "bone3",
  "stiffness",
  "damping",
  "mass",
  "half_life",
  "max_rate",
  "tol_pos",
  "tol_rot",
  "scalar",
  "index",
]);

const INT_PARAM_IDS = new Set(["max_iters"]);

const VECTOR_PARAM_IDS = new Set(["sizes", "weights", "seed"]);

function coerceToNumber(value: any): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function coerceToInteger(value: any): number {
  const next = Math.floor(Number(value ?? 0));
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

function coerceToNumberArray(value: any): number[] {
  if (Array.isArray(value)) {
    return value.map((entry) => coerceToNumber(entry));
  }
  return [];
}

function convertParam(param: GraphParamState): any {
  if (param.id === "path") {
    if (typeof param.value === "string") {
      return param.value;
    }
    if (param.value != null) {
      return String(param.value);
    }
    return "";
  }

  if (FLOAT_PARAM_IDS.has(param.id)) {
    return coerceToNumber(param.value);
  }

  if (INT_PARAM_IDS.has(param.id)) {
    return coerceToInteger(param.value);
  }

  if (VECTOR_PARAM_IDS.has(param.id)) {
    return coerceToNumberArray(param.value);
  }

  return convertParamValue(param.type, param.value);
}

function convertGraphNode(node: GraphNodeState): any {
  const params: Record<string, any> = {};
  node.params.forEach((param) => {
    params[param.id] = convertParam(param);
  });
  if (node.inputShapeJson) {
    params.shape = parseShapeJson(node.inputShapeJson);
  }
  const converted: Record<string, any> = {
    id: node.id,
    type: node.type,
    params,
    inputs: Object.entries(node.inputs).reduce<
      Record<string, { node_id: string }>
    >((acc, [slot, target]) => {
      if (target) {
        acc[slot] = { node_id: target };
      }
      return acc;
    }, {}),
  };
  return converted;
}

export function graphStateToSpec(
  state: GraphEditorState,
  outputPath: string,
): GraphRegistrationInput {
  const nodes = state.nodes.map((node) => {
    const converted = convertGraphNode(node);
    if (node.type.toLowerCase() === "output") {
      const params = { ...(converted.params ?? {}) };
      const existingPath =
        typeof params.path === "string" && params.path.length > 0
          ? params.path
          : undefined;
      params.path = existingPath ?? outputPath;
      params.shape = parseShapeJson(node.outputShapeJson);
      converted.params = params;
    }
    return converted;
  });
  return {
    spec: {
      nodes,
    },
    subs: {
      inputs: state.inputs,
      outputs: state.outputs.length > 0 ? state.outputs : [outputPath],
    },
  };
}
