import type { Value } from "@vizij/animation-react";
import type { ValueJSON } from "@vizij/node-graph-wasm";

export function animationValueToValueJSON(
  value?: Value,
): ValueJSON | undefined {
  if (!value) return undefined;
  switch (value.type) {
    case "Float":
      return { float: value.data };
    case "Vec2":
      return { vector: [value.data[0] ?? 0, value.data[1] ?? 0] };
    case "Vec3":
      return { vec3: [value.data[0] ?? 0, value.data[1] ?? 0, value.data[2] ?? 0] };
    case "Vec4":
      return {
        vec4: [
          value.data[0] ?? 0,
          value.data[1] ?? 0,
          value.data[2] ?? 0,
          value.data[3] ?? 0,
        ],
      };
    case "Quat":
      return {
        quat: [
          value.data[0] ?? 0,
          value.data[1] ?? 0,
          value.data[2] ?? 0,
          value.data[3] ?? 1,
        ],
      };
    case "ColorRgba":
      return {
        color: [
          value.data[0] ?? 0,
          value.data[1] ?? 0,
          value.data[2] ?? 0,
          value.data[3] ?? 1,
        ],
      };
    case "Transform":
      return {
        transform: {
          pos: [
            value.data.pos[0] ?? 0,
            value.data.pos[1] ?? 0,
            value.data.pos[2] ?? 0,
          ],
          rot: [
            value.data.rot[0] ?? 0,
            value.data.rot[1] ?? 0,
            value.data.rot[2] ?? 0,
            value.data.rot[3] ?? 1,
          ],
          scale: [
            value.data.scale[0] ?? 1,
            value.data.scale[1] ?? 1,
            value.data.scale[2] ?? 1,
          ],
        },
      };
    case "Bool":
      return { bool: Boolean(value.data) };
    case "Text":
      return { text: value.data };
    default:
      return undefined;
  }
}
