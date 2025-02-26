/**
 * Creates pairs of adjacent elements from an array.
 *
 * @template T - The type of elements in the array
 * @param arr - The source array to create pairs from
 * @returns An array of tuples, where each tuple contains consecutive elements
 *
 * @example
 * ```typescript
 * pairwise([1, 2, 3, 4]) // Returns: [[1,2], [2,3], [3,4]]
 * ```
 */
export function pairwise<T>(arr: T[]): [T, T][] {
  return arr.slice(1).map((_, i) => [arr[i], arr[i + 1]]);
}
