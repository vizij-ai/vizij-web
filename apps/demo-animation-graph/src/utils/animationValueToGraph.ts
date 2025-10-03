import {
  valueAsNumericArray,
  valueAsTransform,
  type Value,
} from "@vizij/animation-react";
import type { ValueJSON } from "@vizij/node-graph-wasm";

export function animationValueToValueJSON(
  value?: Value,
): ValueJSON | undefined {
  if (!value) return undefined;
  switch (value.type) {
    case "float":
      return { float: value.data };
    case "vec2": {
      const arr = valueAsNumericArray(value) ?? [0, 0];
      return { vector: [arr[0] ?? 0, arr[1] ?? 0] };
    }
    case "vec3": {
      const arr = valueAsNumericArray(value) ?? [0, 0, 0];
      return { vec3: [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0] };
    }
    case "vec4": {
      const arr = valueAsNumericArray(value) ?? [0, 0, 0, 0];
      return { vec4: [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0] };
    }
    case "quat": {
      const arr = valueAsNumericArray(value) ?? [0, 0, 0, 1];
      return { quat: [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 1] };
    }
    case "colorrgba": {
      const arr = valueAsNumericArray(value) ?? [0, 0, 0, 1];
      return { color: [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 1] };
    }
    case "vector":
      return { vector: (valueAsNumericArray(value) ?? []).map((v) => v ?? 0) };
    case "transform": {
      const tr = valueAsTransform(value);
      if (!tr) return undefined;
      return {
        transform: {
          translation: tr.translation.slice() as [number, number, number],
          rotation: tr.rotation.slice() as [number, number, number, number],
          scale: tr.scale.slice() as [number, number, number],
        },
      };
    }
    case "bool":
      return { bool: Boolean(value.data) };
    case "text":
      return { text: value.data };
    default:
      return undefined;
  }
}
