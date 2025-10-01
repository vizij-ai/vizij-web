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
  switch (kind) {
    case "float":
      return { type: "float", data: Number(value ?? 0) } as ValueJSON;
    case "bool":
      return { type: "bool", data: Boolean(value) } as ValueJSON;
    case "vec2": {
      const vec = value ?? {};
      return {
        type: "vec2",
        data: [Number(vec.x ?? vec[0] ?? 0), Number(vec.y ?? vec[1] ?? 0)],
      } as ValueJSON;
    }
    case "vec3": {
      const vec = value ?? {};
      return {
        type: "vec3",
        data: [
          Number(vec.x ?? vec[0] ?? 0),
          Number(vec.y ?? vec[1] ?? 0),
          Number(vec.z ?? vec[2] ?? 0),
        ],
      } as ValueJSON;
    }
    case "vec4":
    case "quat": {
      const vec = value ?? {};
      return {
        type: kind,
        data: [
          Number(vec.x ?? vec[0] ?? 0),
          Number(vec.y ?? vec[1] ?? 0),
          Number(vec.z ?? vec[2] ?? 0),
          Number(vec.w ?? vec[3] ?? 0),
        ],
      } as ValueJSON;
    }
    case "color": {
      const col = value ?? {};
      return {
        type: "color",
        data: [
          Number(col.r ?? col[0] ?? 1),
          Number(col.g ?? col[1] ?? 1),
          Number(col.b ?? col[2] ?? 1),
          Number(col.a ?? col[3] ?? 1),
        ],
      } as ValueJSON;
    }
    case "vector":
      return {
        type: "vector",
        data: Array.isArray(value)
          ? value.map((entry) => Number(entry ?? 0))
          : [],
      } as ValueJSON;
    case "transform": {
      const transform = value ?? {};
      return {
        type: "transform",
        data: {
          pos: normalizeForGraph(
            "vec3",
            transform.position ?? transform.pos ?? {},
          ),
          rot: normalizeForGraph(
            "vec3",
            transform.rotation ?? transform.rot ?? {},
          ),
          scale: normalizeForGraph("vec3", transform.scale ?? {}),
        },
      } as ValueJSON;
    }
    case "custom": {
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return { type: "json", data: parsed } as ValueJSON;
        } catch {
          return { type: "text", data: value } as ValueJSON;
        }
      }
      if (value == null) {
        return { type: "json", data: null } as ValueJSON;
      }
      return value as ValueJSON;
    }
    default:
      return value as ValueJSON;
  }
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
    value_type: track.valueKind,
    shape: parseShapeJson(track.shapeJson),
    points: track.keyframes.map((key) => {
      const base: any = {
        id: key.id,
        stamp: key.stamp,
        value: valueToJSON(track.valueKind, key.value) as ValueJSON,
      };
      if (key.handleIn) {
        base.handle_in = { x: key.handleIn.x, y: key.handleIn.y };
      }
      if (key.handleOut) {
        base.handle_out = { x: key.handleOut.x, y: key.handleOut.y };
      }
      return base;
    }),
  };
  if (track.optionId) {
    converted.option_id = track.optionId;
  }
  if (track.componentKey) {
    converted.component_key = track.componentKey;
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
      converted.params = {
        ...(converted.params ?? {}),
        path: outputPath,
        shape: parseShapeJson(node.outputShapeJson),
      };
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
