import { type ValueJSON } from "@vizij/node-graph-react";

export function displayValue(v?: ValueJSON, precision: number = 3): string {
  if (!v) return "N/A";
  if ("bool" in v) return v.bool ? "true" : "false";
  if ("float" in v) {
    if (typeof v.float === 'number' && Number.isFinite(v.float)) {
      return v.float.toFixed(precision);
    }
    return "N/A";
  }
  if ("vec3" in v) {
    if (Array.isArray(v.vec3)) {
      return `[${v.vec3.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(precision) : "N/A")).join(", ")}]`;
    }
    return "N/A";
  }
  return "N/A";
}
