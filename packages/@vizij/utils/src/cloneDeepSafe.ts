/**
 * Deep clones a value, preserving Map, Set, Date, RegExp, TypedArray, and ArrayBuffer.
 * Uses structuredClone if available, otherwise falls back to a recursive implementation.
 */
export function cloneDeepSafe<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  // Fallback implementation
  return cloneDeepRecursive(value);
}

function cloneDeepRecursive<T>(value: T, map = new WeakMap()): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (map.has(value)) {
    return map.get(value);
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as any;
  }

  if (value instanceof RegExp) {
    return new RegExp(value) as any;
  }

  if (value instanceof Map) {
    const result = new Map();
    map.set(value, result);
    value.forEach((v, k) => {
      result.set(cloneDeepRecursive(k, map), cloneDeepRecursive(v, map));
    });
    return result as any;
  }

  if (value instanceof Set) {
    const result = new Set();
    map.set(value, result);
    value.forEach((v) => {
      result.add(cloneDeepRecursive(v, map));
    });
    return result as any;
  }

  if (Array.isArray(value)) {
    const result: any[] = [];
    map.set(value, result);
    value.forEach((v) => {
      result.push(cloneDeepRecursive(v, map));
    });
    return result as any;
  }

  if (ArrayBuffer.isView(value)) {
    // TypedArray or DataView
    // @ts-ignore
    return new value.constructor(value);
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as any;
  }

  const result = {};
  map.set(value, result);
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      (result as any)[key] = cloneDeepRecursive((value as any)[key], map);
    }
  }
  return result as any;
}

/**
 * Specialized helper for cloning GraphSpecs.
 * Currently just an alias for cloneDeepSafe.
 */
export function cloneGraphSpec<T = any>(spec: T): T {
  return cloneDeepSafe(spec);
}
