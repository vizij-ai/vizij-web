import { useEffect, useMemo, useRef, useState } from "react";

type NumericMap<T extends string> = Record<T, number | undefined>;

function appendValue(
  values: number[],
  next: number | undefined,
  capacity: number,
): number[] {
  if (typeof next !== "number" || Number.isNaN(next)) {
    return values;
  }
  const trimmed = values.length >= capacity ? values.slice(1) : values.slice();
  trimmed.push(next);
  return trimmed;
}

const arraysEqual = (a: readonly string[], b: readonly string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/**
 * Accumulate synchronized number series keyed by identifier, advancing once per frame id.
 */
export function useSyncedSeries<T extends string>(
  values: NumericMap<T>,
  frameId: number | null | undefined,
  capacity = 180,
): Record<T, number[]> {
  const keys = useMemo(() => Object.keys(values) as T[], [values]);
  const [data, setData] = useState<Record<T, number[]>>(() => {
    const seeded = {} as Record<T, number[]>;
    for (const key of keys) {
      seeded[key] = [];
    }
    return seeded;
  });

  const capacityRef = useRef(capacity);
  capacityRef.current = capacity;

  const keysRef = useRef<readonly string[]>(keys);
  useEffect(() => {
    if (arraysEqual(keysRef.current, keys)) {
      return;
    }
    keysRef.current = keys;
    setData((prev) => {
      const merged = { ...prev } as Record<T, number[]>;
      for (const key of keys) {
        if (!merged[key]) {
          merged[key] = [];
        }
      }
      return merged;
    });
  }, [keys]);

  const lastFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (frameId == null || frameId === lastFrameRef.current) {
      return;
    }
    lastFrameRef.current = frameId;
    setData((prev) => {
      const next = { ...prev } as Record<T, number[]>;
      let mutated = false;
      for (const key of keys) {
        const current = next[key] ?? [];
        const appended = appendValue(current, values[key], capacityRef.current);
        if (appended !== current) {
          next[key] = appended;
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [frameId, keys, values]);

  return data;
}
