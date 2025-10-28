import { useEffect, useMemo } from "react";
import { useVizijStore } from "@vizij/render";
import { useOrchFrame, type ValueJSON } from "@vizij/orchestrator-react";
import {
  valueAsBool,
  valueAsColorRgba,
  valueAsNumber,
  valueAsTransform,
  valueAsVector,
  isNormalizedValue,
} from "@vizij/value-json";
import type { RawValue } from "@vizij/utils";

function numericArrayToRaw(arr: number[]): RawValue {
  const normalized = arr.map((entry) => Number(entry ?? 0));
  switch (normalized.length) {
    case 2:
      return { x: normalized[0], y: normalized[1] } as unknown as RawValue;
    case 3:
      return {
        x: normalized[0],
        y: normalized[1],
        z: normalized[2],
      } as unknown as RawValue;
    case 4:
      return {
        x: normalized[0],
        y: normalized[1],
        z: normalized[2],
        w: normalized[3],
      } as unknown as RawValue;
    default:
      return normalized as unknown as RawValue;
  }
}

function valueJSONToRaw(value: ValueJSON | undefined): RawValue | undefined {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value as unknown as RawValue;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => valueJSONToRaw(entry)) as unknown as RawValue;
  }

  if (typeof value === "object" && !("type" in value)) {
    const entries = Object.entries(value).map(([key, entry]) => [
      key,
      valueJSONToRaw(entry as ValueJSON),
    ]);
    return Object.fromEntries(entries) as unknown as RawValue;
  }

  if (!isNormalizedValue(value)) {
    return undefined;
  }

  switch (value.type) {
    case "float": {
      const num = valueAsNumber(value);
      return typeof num === "number" ? (num as RawValue) : undefined;
    }
    case "bool": {
      const boolVal = valueAsBool(value);
      return typeof boolVal === "boolean" ? (boolVal as RawValue) : undefined;
    }
    case "text": {
      const text = value.data ?? "";
      return String(text) as unknown as RawValue;
    }
    case "vec2":
    case "vec3":
    case "vec4":
    case "quat":
    case "vector": {
      const vec = valueAsVector(value);
      return vec ? numericArrayToRaw(vec) : undefined;
    }
    case "colorrgba": {
      const color = valueAsColorRgba(value);
      if (!color) {
        return undefined;
      }
      const [r = 0, g = 0, b = 0, a = 1] = color;
      return { r, g, b, a } as unknown as RawValue;
    }
    case "transform": {
      const transform = valueAsTransform(value);
      if (!transform) {
        return undefined;
      }
      return {
        translation: numericArrayToRaw(transform.translation),
        rotation: numericArrayToRaw(transform.rotation),
        scale: numericArrayToRaw(transform.scale),
      } as unknown as RawValue;
    }
    case "record": {
      const entries = Object.entries(value.data ?? {}).map(([key, entry]) => [
        key,
        valueJSONToRaw(entry),
      ]);
      return Object.fromEntries(entries) as unknown as RawValue;
    }
    case "enum": {
      const [tag, inner] = value.data;
      return {
        tag,
        value: valueJSONToRaw(inner),
      } as unknown as RawValue;
    }
    default:
      return undefined;
  }
}

export function RenderBridge({
  namespace,
  outputPaths,
  enabled,
}: {
  namespace: string;
  outputPaths: string[];
  enabled: boolean;
}) {
  const frame = useOrchFrame();
  const setValue = useVizijStore((state) => state.setValue);
  const pathSet = useMemo(() => new Set(outputPaths), [outputPaths]);

  useEffect(() => {
    if (!enabled || !frame || pathSet.size === 0) {
      return;
    }

    const writes = frame.merged_writes ?? [];
    if (!writes.length) {
      return;
    }

    writes.forEach((write) => {
      const normalized = write.path.startsWith("debug/")
        ? write.path.slice("debug/".length)
        : write.path;
      if (!pathSet.has(normalized)) {
        return;
      }
      const raw = valueJSONToRaw(write.value);
      if (raw === undefined) {
        return;
      }
      setValue(normalized, namespace, raw);
    });
  }, [enabled, frame, namespace, pathSet, setValue]);

  return null;
}
