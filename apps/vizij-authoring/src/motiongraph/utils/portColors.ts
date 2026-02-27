export type PortColor = {
  bg: string;
  border: string;
};

type TypeEntry = {
  label: string;
  color: PortColor;
};

const TYPE_ENTRIES: Record<string, TypeEntry> = {
  f32: { label: "Float (f32)", color: { bg: "#60a5fa", border: "#2563eb" } },
  float: { label: "Float", color: { bg: "#60a5fa", border: "#2563eb" } },
  i32: { label: "Int (i32)", color: { bg: "#22d3ee", border: "#0891b2" } },
  int: { label: "Int", color: { bg: "#22d3ee", border: "#0891b2" } },
  integer: { label: "Integer", color: { bg: "#22d3ee", border: "#0891b2" } },
  bool: { label: "Bool", color: { bg: "#facc15", border: "#ca8a04" } },
  boolean: { label: "Boolean", color: { bg: "#facc15", border: "#ca8a04" } },
  vector: { label: "Vector", color: { bg: "#e879f9", border: "#a21caf" } },
  vec: { label: "Vector", color: { bg: "#e879f9", border: "#a21caf" } },
  vec2: { label: "Vec2", color: { bg: "#c084fc", border: "#9333ea" } },
  vec3: { label: "Vec3", color: { bg: "#a78bfa", border: "#7c3aed" } },
  vec4: { label: "Vec4", color: { bg: "#f472b6", border: "#db2777" } },
  quat: { label: "Quaternion", color: { bg: "#f472b6", border: "#db2777" } },
  string: { label: "String", color: { bg: "#fb923c", border: "#ea580c" } },
  str: { label: "String", color: { bg: "#fb923c", border: "#ea580c" } },
  any: { label: "Any", color: { bg: "#737373", border: "#525252" } },
};

const FALLBACK_COLOR: PortColor = { bg: "#a3a3a3", border: "#737373" };

export function getPortColor(type: string): PortColor {
  return TYPE_ENTRIES[type.toLowerCase()]?.color ?? FALLBACK_COLOR;
}

export function getPortLabel(type: string): string {
  return TYPE_ENTRIES[type.toLowerCase()]?.label ?? type;
}

/** Deduplicated entries for the legend (one per unique color). */
export const LEGEND_TYPES: { type: string; label: string; color: PortColor }[] =
  [
    { type: "f32", label: "Float (f32)", color: TYPE_ENTRIES.f32.color },
    { type: "i32", label: "Int (i32)", color: TYPE_ENTRIES.i32.color },
    { type: "bool", label: "Bool", color: TYPE_ENTRIES.bool.color },
    {
      type: "vector",
      label: "Vector (any length)",
      color: TYPE_ENTRIES.vector.color,
    },
    { type: "vec2", label: "Vec2", color: TYPE_ENTRIES.vec2.color },
    { type: "vec3", label: "Vec3", color: TYPE_ENTRIES.vec3.color },
    { type: "vec4", label: "Vec4 / Quat", color: TYPE_ENTRIES.vec4.color },
    { type: "string", label: "String", color: TYPE_ENTRIES.string.color },
    { type: "any", label: "Any (wildcard)", color: TYPE_ENTRIES.any.color },
  ];
