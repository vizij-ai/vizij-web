/**
 * Converts an array of 2D points to an SVG path string.
 *
 * @param points - Array of [x, y] coordinate pairs
 * @param close - If true, closes the path by adding a 'Z' command
 * @returns An SVG path string using absolute move ('M') and line ('L') commands
 *
 * @example
 * ```typescript
 * pointsToPath([[0, 0], [1, 1], [2, 0]])     // Returns "M 0 0 L 1 1 L 2 0"
 * pointsToPath([[0, 0], [1, 1]], true)        // Returns "M 0 0 L 1 1 Z"
 * ```
 *
 * @remarks
 * The path starts with a move command to the first point, followed by line commands
 * to each subsequent point. If close is true, a final 'Z' command is added to
 * create a closed shape.
 */
export function pointsToPath(
  points: [number, number][],
  close?: boolean,
): string {
  if (close) {
    return [
      points
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"} ${p[0].toString()} ${p[1].toString()}`,
        )
        .join(" "),
      " Z",
    ].join(" ") as string;
  } else {
    return points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${p[0].toString()} ${p[1].toString()}`,
      )
      .join(" ") as string;
  }
}
