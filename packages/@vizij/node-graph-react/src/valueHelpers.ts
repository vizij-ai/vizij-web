/**
 * Value helpers ported from the legacy index.tsx.
 * Provides convenient readers for ValueJSON/PortSnapshot shapes.
 *
 * Only a small subset is exported (valueAsNumber) but we include related helpers
 * for completeness and future use.
 */

export type ValueJSON = any;
export type PortSnapshot = any;

function extractValueJSON(
  v?: PortSnapshot | ValueJSON | null,
): ValueJSON | undefined {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && "value" in v && "shape" in v) {
    return (v as PortSnapshot).value;
  }
  if (typeof v === "object" && v !== null) {
    return v as ValueJSON;
  }
  return undefined;
}

export function valueAsNumber(
  v?: PortSnapshot | ValueJSON | null,
): number | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("float" in val) return val.float;
  if ("bool" in val) return val.bool ? 1 : 0;
  if ("vec3" in val) return val.vec3[0];
  if ("vec4" in val) return val.vec4[0];
  if ("quat" in val) return val.quat[0];
  if ("color" in val) return val.color[0];
  if ("vector" in val) return val.vector[0] ?? 0;
  if ("transform" in val) return val.transform.pos?.[0] ?? 0;
  if ("enum" in val) return valueAsNumber(val.enum.value);
  if ("array" in val) return valueAsNumber(val.array[0]);
  if ("list" in val) return valueAsNumber(val.list[0]);
  if ("tuple" in val) return valueAsNumber(val.tuple[0]);
  return undefined;
}

export function valueAsVec3(
  v?: PortSnapshot | ValueJSON | null,
): [number, number, number] | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("vec3" in val) return val.vec3;
  if ("vec4" in val) return [val.vec4[0], val.vec4[1], val.vec4[2]];
  if ("quat" in val) return [val.quat[0], val.quat[1], val.quat[2]];
  if ("color" in val) return [val.color[0], val.color[1], val.color[2]];
  if ("vector" in val)
    return [val.vector[0] ?? 0, val.vector[1] ?? 0, val.vector[2] ?? 0];
  if ("transform" in val) {
    const pos = val.transform.pos ?? [0, 0, 0];
    return [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0];
  }
  if ("enum" in val) return valueAsVec3(val.enum.value);
  if ("array" in val) return valueAsVec3(val.array[0]);
  if ("list" in val) return valueAsVec3(val.list[0]);
  if ("tuple" in val) return valueAsVec3(val.tuple[0]);
  if ("float" in val) return [val.float, val.float, val.float];
  if ("bool" in val) return val.bool ? [1, 1, 1] : [0, 0, 0];
  return undefined;
}

export function valueAsVector(
  v?: PortSnapshot | ValueJSON | null,
): number[] | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("vector" in val) return val.vector.slice();
  if ("vec3" in val) return [val.vec3[0], val.vec3[1], val.vec3[2]];
  if ("vec4" in val)
    return [val.vec4[0], val.vec4[1], val.vec4[2], val.vec4[3]];
  if ("quat" in val)
    return [val.quat[0], val.quat[1], val.quat[2], val.quat[3]];
  if ("color" in val)
    return [val.color[0], val.color[1], val.color[2], val.color[3]];
  if ("transform" in val) {
    const pos = val.transform.pos ?? [0, 0, 0];
    const rot = val.transform.rot ?? [0, 0, 0, 1];
    const scale = val.transform.scale ?? [1, 1, 1];
    return [...pos, ...rot, ...scale];
  }
  if ("enum" in val) return valueAsVector(val.enum.value);
  if ("array" in val)
    return val.array.flatMap((entry: any) => valueAsVector(entry) ?? []);
  if ("list" in val)
    return val.list.flatMap((entry: any) => valueAsVector(entry) ?? []);
  if ("tuple" in val)
    return val.tuple.flatMap((entry: any) => valueAsVector(entry) ?? []);
  if ("float" in val) return [val.float];
  if ("bool" in val) return val.bool ? [1] : [0];
  return undefined;
}

export function valueAsBool(
  v?: PortSnapshot | ValueJSON | null,
): boolean | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("bool" in val) return val.bool;
  if ("float" in val) return val.float !== 0;
  if ("text" in val) return val.text.length > 0;
  if ("vector" in val) return val.vector.some((x: any) => x !== 0);
  if ("vec3" in val) return val.vec3.some((x: any) => x !== 0);
  if ("vec4" in val) return val.vec4.some((x: any) => x !== 0);
  if ("quat" in val) return val.quat.some((x: any) => x !== 0);
  if ("color" in val) return val.color.some((x: any) => x !== 0);
  if ("transform" in val)
    return (
      (val.transform.pos ?? []).some((x: any) => x !== 0) ||
      (val.transform.rot ?? []).some((x: any) => x !== 0) ||
      (val.transform.scale ?? []).some((x: any) => x !== 0)
    );
  if ("enum" in val) return valueAsBool(val.enum.value) ?? false;
  if ("record" in val)
    return Object.values(val.record).some((entry) => valueAsBool(entry));
  if ("array" in val) return val.array.some((entry: any) => valueAsBool(entry));
  if ("list" in val) return val.list.some((entry: any) => valueAsBool(entry));
  if ("tuple" in val) return val.tuple.some((entry: any) => valueAsBool(entry));
  return undefined;
}
