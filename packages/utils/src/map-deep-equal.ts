import isDeepEqual from "fast-deep-equal";

/**
 * Filter function type for map comparison
 */
export type MapFilterFn<K, V> = (key: K, value: V) => boolean;

/**
 * Options for map deep equality comparison
 */
export interface MapDeepEqualOptions<K, V> {
  /** Filter function to determine which entries to compare */
  filter?: MapFilterFn<K, V>;
}

/**
 * Compares two maps for deep equality by checking all key/value pairs.
 * Optionally filters which entries to consider in the comparison.
 *
 * @param map1 - The first map to compare.
 * @param map2 - The second map to compare.
 * @param options - Optional configuration for the comparison
 * @returns True if both maps have the same entries (after filtering); false otherwise.
 *
 * @example
 * ```typescript
 * const mapA = new Map([["key1", { a: 1 }], ["key2", { b: 2 }]]);
 * const mapB = new Map([["key1", { a: 1 }], ["key2", { b: 2 }]]);
 * console.log(isMapDeepEqual(mapA, mapB)); // true
 *
 * // With filter - only compare entries where key starts with "key1"
 * const mapC = new Map([["key1", { a: 1 }], ["key2", { b: 3 }]]);
 * const mapD = new Map([["key1", { a: 1 }], ["key2", { b: 2 }]]);
 * console.log(isMapDeepEqual(mapC, mapD, {
 *   filter: (key) => key.toString().startsWith("key1")
 * })); // true (only key1 is compared)
 *
 * // Filter by value properties
 * const mapE = new Map([["a", { priority: 1, data: "x" }], ["b", { priority: 2, data: "y" }]]);
 * const mapF = new Map([["a", { priority: 1, data: "z" }], ["b", { priority: 2, data: "y" }]]);
 * console.log(isMapDeepEqual(mapE, mapF, {
 *   filter: (key, value) => value.priority === 2
 * })); // true (only compares entries with priority: 2)
 * ```
 */
export function isMapDeepEqual<K, V>(
  map1: Map<K, V>,
  map2: Map<K, V>,
  options: MapDeepEqualOptions<K, V> = {},
): boolean {
  // Early exit for same reference
  if (map1 === map2) return true;

  const { filter } = options || {};

  // If no filter, use optimized original logic
  if (!filter) {
    if (map1.size !== map2.size) return false;

    for (const [key, value] of map1.entries()) {
      if (!map2.has(key)) return false;
      const otherValue = map2.get(key);
      // Skip expensive deep comparison if references are the same
      if (value !== otherValue && !isDeepEqual(value, otherValue)) {
        return false;
      }
    }
    return true;
  }

  // With filter: collect filtered entries from both maps
  const filteredEntries1: [K, V][] = [];
  const filteredEntries2: [K, V][] = [];

  for (const [key, value] of map1.entries()) {
    if (filter(key, value)) {
      filteredEntries1.push([key, value]);
    }
  }

  for (const [key, value] of map2.entries()) {
    if (filter(key, value)) {
      filteredEntries2.push([key, value]);
    }
  }

  // Compare sizes first
  if (filteredEntries1.length !== filteredEntries2.length) {
    return false;
  }

  // Create a map from filtered entries of map2 for efficient lookup
  const filteredMap2 = new Map(filteredEntries2);

  // Compare each filtered entry from map1
  for (const [key, value] of filteredEntries1) {
    if (!filteredMap2.has(key)) return false;
    const otherValue = filteredMap2.get(key);
    if (value !== otherValue && !isDeepEqual(value, otherValue)) {
      return false;
    }
  }

  return true;
}
