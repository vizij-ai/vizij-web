import isDeepEqual from "fast-deep-equal";
/**
 * Compares two maps for deep equality by checking all key/value pairs.
 *
 * @param map1 - The first map to compare.
 * @param map2 - The second map to compare.
 * @returns True if both maps have the same entries; false otherwise.
 *
 * @example
 * ```typescript
 * const mapA = new Map([["key1", { a: 1 }]]);
 * const mapB = new Map([["key1", { a: 1 }]]);
 * console.log(isMapDeepEqual(mapA, mapB)); // true
 * ```
 */
export function isMapDeepEqual<K, V>(map1: Map<K, V>, map2: Map<K, V>): boolean {
  if (map1.size !== map2.size) return false;
  for (const [key, value] of map1.entries()) {
    if (!map2.has(key)) return false;
    const otherValue = map2.get(key);
    // using isDeepEqual from fast-deep-equal to compare values
    if (!isDeepEqual(value, otherValue)) {
      return false;
    }
  }
  return true;
}
