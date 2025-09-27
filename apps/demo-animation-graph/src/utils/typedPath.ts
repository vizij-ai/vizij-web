export type PathValueKind =
  | "float"
  | "vec2"
  | "vec3"
  | "vec4"
  | "quat"
  | "color"
  | "transform"
  | "bool"
  | "text"
  | "vector";

function segmentToString(segment: string | number): string {
  if (typeof segment === "number") {
    return segment.toString(10);
  }
  return segment.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_\/-]/g, "");
}

/**
 * Build a typed path string such as "vec3:rig/hand/ikTarget".
 * Tracks and node graph IO in this demo share the same builder so the
 * exact path strings can be reused between animation and graph specs.
 */
export function makeTypedPath(
  type: PathValueKind,
  ...segments: (string | number)[]
): string {
  const tail = segments.map(segmentToString).join("/");
  return `${type}:${tail}`;
}
