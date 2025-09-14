/**
 * Merges overlapping segments in an array of intervals.
 *
 * This function takes an array of intervals represented as tuples of two numbers,
 * sorts them, and merges any overlapping intervals. The result is an array of
 * non-overlapping intervals that cover the same ranges as the input.
 *
 * @param original - An array of intervals represented as tuples of two numbers.
 *                   Each tuple contains a start and end value.
 * @returns An array of merged, non-overlapping intervals.
 *
 * @example
 * ```typescript
 * const intervals = [[1, 3], [2, 4], [5, 7]];
 * const result = overlappingSegments(intervals);
 * console.log(result); // Output: [[1, 4], [5, 7]]
 * ```
 */
export function overlappingSegments(
  original: [number, number][],
): [number, number][] {
  const output: [number, number][] = [];
  original
    .toSorted((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
    .forEach(([start, end]: [number, number]) => {
      const lastIndex = output.length - 1;
      if (output.length > 0 && output[lastIndex][1] >= start) {
        output[lastIndex][1] = Math.max(output[lastIndex][1], end);
      } else {
        output.push([start, end]);
      }
    });

  return output;
}
