import type { PortSnapshot, ValueJSON } from "@vizij/node-graph-wasm";

/** Normalize either a single ValueJSON or a map of outputs { key: ValueJSON } to a single ValueJSON.
 * Prefer 'out' if present, otherwise pick the first key. */
function pickDefaultOutput(v?: unknown): ValueJSON | undefined {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && "value" in (v as any)) {
    return (v as PortSnapshot).value;
  }
  const obj = v as Record<string, unknown>;
  if (typeof obj !== "object") return undefined;
  if ("float" in obj || "bool" in obj || "vec3" in obj || "vector" in obj)
    return obj as ValueJSON;
  const map = obj as Record<string, PortSnapshot>;
  if (map.out) return map.out.value;
  const k = Object.keys(map)[0];
  return k ? map[k].value : undefined;
}

export function displayValue(v?: unknown, precision: number = 3): string {
  const val = pickDefaultOutput(v);
  if (!val) return "N/A";
  if ("bool" in val) return val.bool ? "true" : "false";
  if ("float" in val) {
    if (typeof val.float === "number" && Number.isFinite(val.float)) {
      return val.float.toFixed(precision);
    }
    return "N/A";
  }
  if ("text" in val) {
    return val.text;
  }
  if ("vec3" in val) {
    if (Array.isArray(val.vec3)) {
      return `[${val.vec3
        .map((n: number) =>
          typeof n === "number" && Number.isFinite(n)
            ? n.toFixed(precision)
            : "N/A",
        )
        .join(", ")}]`;
    }
    return "N/A";
  }
  if ("vec4" in val) {
    if (Array.isArray(val.vec4)) {
      return `[${val.vec4
        .map((n: number) =>
          typeof n === "number" && Number.isFinite(n)
            ? n.toFixed(precision)
            : "N/A",
        )
        .join(", ")}]`;
    }
    return "N/A";
  }
  if ("quat" in val) {
    if (Array.isArray(val.quat)) {
      return `quat(${val.quat
        .map((n: number) =>
          typeof n === "number" && Number.isFinite(n)
            ? n.toFixed(precision)
            : "N/A",
        )
        .join(", ")})`;
    }
    return "N/A";
  }
  if ("color" in val) {
    if (Array.isArray(val.color)) {
      return `rgba(${val.color
        .map((n: number) =>
          typeof n === "number" && Number.isFinite(n)
            ? n.toFixed(precision)
            : "N/A",
        )
        .join(", ")})`;
    }
    return "N/A";
  }
  if ("transform" in val) {
    const pos = val.transform.pos ?? [0, 0, 0];
    const rot = val.transform.rot ?? [0, 0, 0, 1];
    const scale = val.transform.scale ?? [1, 1, 1];
    const fmt = (arr: number[]) =>
      `[${arr
        .map((n: number) =>
          typeof n === "number" && Number.isFinite(n)
            ? n.toFixed(precision)
            : "N/A",
        )
        .join(", ")}]`;
    return `T(pos=${fmt(pos)}, rot=${fmt(rot)}, scale=${fmt(scale)})`;
  }
  if ("vector" in val) {
    if (Array.isArray(val.vector)) {
      return `[${val.vector
        .map((n: number) =>
          typeof n === "number" && Number.isFinite(n)
            ? n.toFixed(precision)
            : "N/A",
        )
        .join(", ")}]`;
    }
    return "N/A";
  }
  if ("enum" in val) {
    const tag = val.enum.tag;
    const payload = displayValue(val.enum.value, precision);
    return `${tag}(${payload})`;
  }
  if ("record" in val) {
    const entries = Object.entries(val.record || {}).map(
      ([key, value]) => `${key}: ${displayValue(value, precision)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  if ("array" in val) {
    return `[${val.array
      .map((entry) => displayValue(entry, precision))
      .join(", ")}]`;
  }
  if ("list" in val) {
    return `[${val.list
      .map((entry) => displayValue(entry, precision))
      .join(", ")}]`;
  }
  if ("tuple" in val) {
    return `(${val.tuple
      .map((entry) => displayValue(entry, precision))
      .join(", ")})`;
  }
  return "N/A";
}
