import type { ValueJSON } from "@vizij/node-graph-wasm";

/** Normalize either a single ValueJSON or a map of outputs { key: ValueJSON } to a single ValueJSON.
 * Prefer 'out' if present, otherwise pick the first key. */
function pickDefaultOutput(v?: unknown): ValueJSON | undefined {
  if (!v) return undefined;
  const obj = v as Record<string, unknown>;
  if (typeof obj !== "object") return undefined;
  if ("float" in obj || "bool" in obj || "vec3" in obj || "vector" in obj)
    return obj as ValueJSON;
  const map = obj as Record<string, ValueJSON>;
  if (map.out) return map.out;
  const k = Object.keys(map)[0];
  return k ? map[k] : undefined;
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
  return "N/A";
}
