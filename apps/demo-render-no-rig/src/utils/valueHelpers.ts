import type { ValueJSON } from "@vizij/orchestrator-react";
import type { ValueKind } from "../types";

export function defaultValueForKind(kind: ValueKind): any {
  switch (kind) {
    case "float":
      return 0;
    case "bool":
      return false;
    case "vec2":
      return { x: 0, y: 0 };
    case "vec3":
      return { x: 0, y: 0, z: 0 };
    case "vec4":
    case "quat":
      return { x: 0, y: 0, z: 0, w: 1 };
    case "color":
      return { r: 1, g: 1, b: 1, a: 1 };
    case "vector":
      return [0];
    case "transform":
      return {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };
    case "custom":
    default:
      return "";
  }
}

export function valueToJSON(kind: ValueKind, value: any): ValueJSON {
  switch (kind) {
    case "float":
      return typeof value === "number" ? value : Number(value ?? 0);
    case "bool":
      return Boolean(value);
    case "vec2": {
      const vec = value ?? {};
      return { vec2: [Number(vec.x ?? 0), Number(vec.y ?? 0)] };
    }
    case "vec3": {
      const vec = value ?? {};
      return {
        vec3: [Number(vec.x ?? 0), Number(vec.y ?? 0), Number(vec.z ?? 0)],
      };
    }
    case "vec4":
    case "quat": {
      const vec = value ?? {};
      return {
        vec4: [
          Number(vec.x ?? 0),
          Number(vec.y ?? 0),
          Number(vec.z ?? 0),
          Number(vec.w ?? 1),
        ],
      };
    }
    case "color": {
      const col = value ?? {};
      return {
        color: [
          Number(col.r ?? 1),
          Number(col.g ?? 1),
          Number(col.b ?? 1),
          Number(col.a ?? 1),
        ],
      };
    }
    case "vector": {
      const arr = Array.isArray(value) ? value : [];
      return { vector: arr.map((v) => Number(v ?? 0)) };
    }
    case "transform": {
      const transform = value ?? {};
      return {
        transform: {
          pos: valueToJSON("vec3", transform.position ?? transform.pos ?? {}),
          rot: valueToJSON("vec3", transform.rotation ?? transform.rot ?? {}),
          scale: valueToJSON("vec3", transform.scale ?? {}),
        },
      };
    }
    case "custom": {
      if (value == null || value === "") {
        return { float: 0 };
      }
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return parsed as ValueJSON;
        } catch {
          return value as unknown as ValueJSON;
        }
      }
      return value as ValueJSON;
    }
    default:
      return value as ValueJSON;
  }
}

export function jsonToValue(
  kind: ValueKind,
  value: ValueJSON | undefined,
): any {
  if (value == null) {
    return defaultValueForKind(kind);
  }
  switch (kind) {
    case "float":
      if (typeof value === "number") return value;
      if (typeof value === "object" && "float" in value) {
        return Number((value as any).float ?? 0);
      }
      return Number(value as any);
    case "bool":
      if (typeof value === "boolean") return value;
      if (typeof value === "object" && "bool" in value) {
        return Boolean((value as any).bool);
      }
      return Boolean(value);
    case "vec2": {
      if (
        typeof value === "object" &&
        "vec2" in value &&
        Array.isArray((value as any).vec2)
      ) {
        const [x = 0, y = 0] = (value as any).vec2 as number[];
        return { x, y };
      }
      return defaultValueForKind(kind);
    }
    case "vec3": {
      if (
        typeof value === "object" &&
        "vec3" in value &&
        Array.isArray((value as any).vec3)
      ) {
        const [x = 0, y = 0, z = 0] = (value as any).vec3 as number[];
        return { x, y, z };
      }
      return defaultValueForKind(kind);
    }
    case "vec4":
    case "quat": {
      if (
        typeof value === "object" &&
        "vec4" in value &&
        Array.isArray((value as any).vec4)
      ) {
        const [x = 0, y = 0, z = 0, w = 1] = (value as any).vec4 as number[];
        return { x, y, z, w };
      }
      return defaultValueForKind(kind);
    }
    case "color": {
      if (
        typeof value === "object" &&
        "color" in value &&
        Array.isArray((value as any).color)
      ) {
        const [r = 1, g = 1, b = 1, a = 1] = (value as any).color as number[];
        return { r, g, b, a };
      }
      return defaultValueForKind(kind);
    }
    case "vector": {
      if (
        typeof value === "object" &&
        "vector" in value &&
        Array.isArray((value as any).vector)
      ) {
        return ((value as any).vector as number[]).map((v) => Number(v ?? 0));
      }
      if (Array.isArray(value)) {
        return value.map((v) => Number(v ?? 0));
      }
      return defaultValueForKind(kind);
    }
    case "transform": {
      if (typeof value === "object" && "transform" in value) {
        const tr = (value as any).transform ?? {};
        return {
          position: jsonToValue("vec3", tr.pos as ValueJSON),
          rotation: jsonToValue("vec3", tr.rot as ValueJSON),
          scale: jsonToValue("vec3", tr.scale as ValueJSON),
        };
      }
      return defaultValueForKind(kind);
    }
    case "custom":
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    default:
      return value;
  }
}
