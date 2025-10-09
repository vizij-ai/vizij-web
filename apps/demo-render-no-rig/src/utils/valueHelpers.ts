import type { ValueJSON } from "@vizij/orchestrator-react";
import type { ValueKind } from "../types";

function coerceNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function ensureRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ensureArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

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
      return Number(
        typeof value === "number" ? value : (value ?? 0),
      ) as unknown as ValueJSON;
    case "bool":
      return Boolean(value) as unknown as ValueJSON;
    case "vec2": {
      if (
        value &&
        typeof value === "object" &&
        "vec2" in (value as Record<string, unknown>) &&
        Array.isArray((value as Record<string, unknown>).vec2)
      ) {
        const [x = 0, y = 0] = ((value as Record<string, unknown>).vec2 ??
          []) as number[];
        return { vec2: [coerceNumber(x, 0), coerceNumber(y, 0)] } as ValueJSON;
      }
      const record = ensureRecord(value);
      const arr = ensureArray(value);
      const x = coerceNumber(record?.x ?? arr?.[0], 0);
      const y = coerceNumber(record?.y ?? arr?.[1], 0);
      return { vec2: [x, y] } as ValueJSON;
    }
    case "vec3": {
      if (
        value &&
        typeof value === "object" &&
        "vec3" in (value as Record<string, unknown>) &&
        Array.isArray((value as Record<string, unknown>).vec3)
      ) {
        const [x = 0, y = 0, z = 0] = ((value as Record<string, unknown>)
          .vec3 ?? []) as number[];
        return {
          vec3: [coerceNumber(x, 0), coerceNumber(y, 0), coerceNumber(z, 0)],
        } as ValueJSON;
      }
      const record = ensureRecord(value);
      const arr = ensureArray(value);
      const x = coerceNumber(record?.x ?? arr?.[0], 0);
      const y = coerceNumber(record?.y ?? arr?.[1], 0);
      const z = coerceNumber(record?.z ?? arr?.[2], 0);
      return { vec3: [x, y, z] } as ValueJSON;
    }
    case "vec4":
    case "quat": {
      const key = kind === "quat" ? "quat" : "vec4";
      if (
        value &&
        typeof value === "object" &&
        key in (value as Record<string, unknown>) &&
        Array.isArray((value as Record<string, unknown>)[key])
      ) {
        const [x = 0, y = 0, z = 0, w = 1] = ((
          value as Record<string, unknown>
        )[key] ?? []) as number[];
        return {
          [key]: [
            coerceNumber(x, 0),
            coerceNumber(y, 0),
            coerceNumber(z, 0),
            coerceNumber(w, 1),
          ],
        } as ValueJSON;
      }
      const record = ensureRecord(value);
      const arr = ensureArray(value);
      const x = coerceNumber(record?.x ?? arr?.[0], 0);
      const y = coerceNumber(record?.y ?? arr?.[1], 0);
      const z = coerceNumber(record?.z ?? arr?.[2], 0);
      const w = coerceNumber(record?.w ?? arr?.[3], 1);
      return {
        [key]: [x, y, z, w],
      } as ValueJSON;
    }
    case "color": {
      if (
        value &&
        typeof value === "object" &&
        "color" in (value as Record<string, unknown>) &&
        Array.isArray((value as Record<string, unknown>).color)
      ) {
        const [r = 1, g = 1, b = 1, a = 1] = ((value as Record<string, unknown>)
          .color ?? []) as number[];
        return {
          color: [
            coerceNumber(r, 1),
            coerceNumber(g, 1),
            coerceNumber(b, 1),
            coerceNumber(a, 1),
          ],
        } as ValueJSON;
      }
      const record = ensureRecord(value);
      const arr = ensureArray(value);
      const r = coerceNumber(record?.r ?? arr?.[0], 1);
      const g = coerceNumber(record?.g ?? arr?.[1], 1);
      const b = coerceNumber(record?.b ?? arr?.[2], 1);
      const a = coerceNumber(record?.a ?? arr?.[3], 1);
      return {
        color: [r, g, b, a],
      } as ValueJSON;
    }
    case "vector": {
      if (
        value &&
        typeof value === "object" &&
        "vector" in (value as Record<string, unknown>) &&
        Array.isArray((value as Record<string, unknown>).vector)
      ) {
        const vector = (value as Record<string, unknown>).vector as number[];
        return {
          vector: vector.map((entry) => coerceNumber(entry, 0)),
        } as ValueJSON;
      }
      const arr = Array.isArray(value) ? value : [];
      return {
        vector: arr.map((v) => coerceNumber(v, 0)),
      } as ValueJSON;
    }
    case "transform": {
      const transformRecord = ensureRecord(value) ?? {};
      const translationSource =
        transformRecord.translation ??
        transformRecord.position ??
        transformRecord.pos;
      const rotationSource = transformRecord.rotation ?? transformRecord.rot;
      const scaleSource = transformRecord.scale;

      const translationArr = ensureArray(translationSource);
      const translationRecord = ensureRecord(translationSource);
      const rotationArr = ensureArray(rotationSource);
      const rotationRecord = ensureRecord(rotationSource);
      const scaleArr = ensureArray(scaleSource);
      const scaleRecord = ensureRecord(scaleSource);

      const translation = [
        coerceNumber(translationRecord?.x ?? translationArr?.[0], 0),
        coerceNumber(translationRecord?.y ?? translationArr?.[1], 0),
        coerceNumber(translationRecord?.z ?? translationArr?.[2], 0),
      ];
      const rotation = [
        coerceNumber(rotationRecord?.x ?? rotationArr?.[0], 0),
        coerceNumber(rotationRecord?.y ?? rotationArr?.[1], 0),
        coerceNumber(rotationRecord?.z ?? rotationArr?.[2], 0),
        coerceNumber(rotationRecord?.w ?? rotationArr?.[3], 1),
      ];
      const scale = [
        coerceNumber(scaleRecord?.x ?? scaleArr?.[0], 1),
        coerceNumber(scaleRecord?.y ?? scaleArr?.[1], 1),
        coerceNumber(scaleRecord?.z ?? scaleArr?.[2], 1),
      ];

      return {
        transform: {
          translation,
          rotation,
          scale,
        },
      } as ValueJSON;
    }
    case "custom": {
      if (value == null || value === "") {
        return 0 as ValueJSON;
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
      if (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        String((value as any).type).toLowerCase() === "float"
      ) {
        return Number((value as any).data ?? 0);
      }
      if (typeof value === "object" && value !== null && "float" in value) {
        return Number((value as any).float ?? 0);
      }
      return Number(value as any);
    case "bool":
      if (typeof value === "boolean") return value;
      if (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        String((value as any).type).toLowerCase() === "bool"
      ) {
        return Boolean((value as any).data);
      }
      if (typeof value === "object" && value !== null && "bool" in value) {
        return Boolean((value as any).bool);
      }
      return Boolean(value);
    case "vec2": {
      if (
        typeof value === "object" &&
        value !== null &&
        "x" in value &&
        "y" in value
      ) {
        return {
          x: Number((value as any).x ?? 0),
          y: Number((value as any).y ?? 0),
        };
      }
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
        value !== null &&
        "x" in value &&
        "y" in value &&
        "z" in value
      ) {
        return {
          x: Number((value as any).x ?? 0),
          y: Number((value as any).y ?? 0),
          z: Number((value as any).z ?? 0),
        };
      }
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
        value !== null &&
        "x" in value &&
        "y" in value &&
        "z" in value &&
        "w" in value
      ) {
        return {
          x: Number((value as any).x ?? 0),
          y: Number((value as any).y ?? 0),
          z: Number((value as any).z ?? 0),
          w: Number((value as any).w ?? 1),
        };
      }
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
        value !== null &&
        "r" in value &&
        "g" in value &&
        "b" in value
      ) {
        return {
          r: Number((value as any).r ?? 1),
          g: Number((value as any).g ?? 1),
          b: Number((value as any).b ?? 1),
          a: Number((value as any).a ?? 1),
        };
      }
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
        value !== null &&
        "type" in value &&
        String((value as any).type).toLowerCase() === "vector" &&
        Array.isArray((value as any).data)
      ) {
        return ((value as any).data as number[]).map((v) => Number(v ?? 0));
      }
      if (
        typeof value === "object" &&
        "vector" in value &&
        Array.isArray((value as any).vector)
      ) {
        return ((value as any).vector as number[]).map((v) => Number(v ?? 0));
      }
      if (Array.isArray(value)) {
        return (value as number[]).map((v) => Number(v ?? 0));
      }
      return defaultValueForKind(kind);
    }
    case "transform": {
      if (typeof value === "object" && value !== null) {
        const record = value as Record<string, any>;
        const translation = record.translation ?? record.position ?? record.pos;
        const rotation = record.rotation ?? record.rot;
        const scale = record.scale;
        return {
          position: jsonToValue("vec3", translation as ValueJSON),
          rotation: jsonToValue("vec4", rotation as ValueJSON),
          scale: jsonToValue("vec3", scale as ValueJSON),
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
