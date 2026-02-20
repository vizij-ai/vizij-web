import { createRef } from "react";
import type { RefObject } from "react";

export function iterateOrExtract(data: any, cb: (data: any) => void): void {
  if (Array.isArray(data)) {
    data.forEach((item) => cb(item));
  } else {
    cb(data);
  }
}

export async function iterateOrExtractAsync(
  data: any,
  cb: (data: any) => Promise<void>,
) {
  if (Array.isArray(data)) {
    await Promise.all(data.map(async (item) => await cb(item)));
  } else {
    await cb(data);
  }
}

export function basename(input: string): string {
  const split = input.split("/");
  return split[split.length - 1];
}

export function processTuple(val: string | null | undefined): number[] {
  if (!val) return [0, 0, 0];
  return val
    .trim()
    .split(/\s+/g)
    .map((num) => parseFloat(num));
}

export function namespaceArrayToRefs<T>(
  namespaces: string[],
  sourceObject?: T | null,
): Record<string, RefObject<T>> {
  const refs = namespaces.reduce<Record<string, RefObject<T>>>((acc, ns) => {
    acc[ns] = createRef<T>() as unknown as RefObject<T>;
    return acc;
  }, {});
  if (sourceObject) {
    refs.__source__ = { current: sourceObject } as RefObject<T>;
  }
  return refs;
}
