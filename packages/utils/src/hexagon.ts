/**
 * Generates an SVG path string for a hexagon with flanges.
 *
 * @param x - Center X coordinate of the hexagon
 * @param y - Center Y coordinate of the hexagon
 * @param size - Width/height of the hexagon's body
 * @param height - Total height including top and bottom flanges
 * @returns SVG path string for the hexagon
 *
 * @example
 * ```typescript
 * const path = getHexagonPath(100, 100, 50, 80);
 * // Use in SVG: <path d={path} />
 * ```
 */
function getHexagonPath(
  x: number,
  y: number,
  size: number,
  height: number,
): string {
  const path = [
    `${x.toString()},${(y - height / 2).toString()}`,
    `${x.toString()},${(y - size / 2).toString()}`,
    `${(x + size * 0.433).toString()},${(y - size / 4).toString()}`,
    `${(x + size * 0.433).toString()},${(y + size / 4).toString()}`,
    `${x.toString()},${(y + size / 2).toString()}`,
    `${x.toString()},${(y + height / 2).toString()}`,
    `${x.toString()},${(y + size / 2).toString()}`,
    `${(x - size * 0.433).toString()},${(y + size / 4).toString()}`,
    `${(x - size * 0.433).toString()},${(y - size / 4).toString()}`,
    `${x.toString()},${(y - size / 2).toString()}`,
  ].join("L");
  return `M${path}Z`;
}

/**
 * Generates an SVG path string for a degenerate (collapsed) hexagon.
 *
 * Creates a vertical line with the same number of vertices as a regular hexagon,
 * allowing smooth interpolation between the two shapes.
 *
 * @param x - Center X coordinate of the line
 * @param y - Center Y coordinate of the line
 * @param size - Reference size (affects vertical spacing of points)
 * @param height - Total height of the line including endpoints
 * @returns SVG path string for the degenerate hexagon
 */
function getDegenerateHexagonPath(
  x: number,
  y: number,
  size: number,
  height: number,
): string {
  const path = [
    `${x.toString()},${(y - height / 2).toString()}`,
    `${x.toString()},${(y - size / 2).toString()}`,
    `${x.toString()},${(y - size / 4).toString()}`,
    `${x.toString()},${(y + size / 4).toString()}`,
    `${x.toString()},${(y + size / 2).toString()}`,
    `${x.toString()},${(y + height / 2).toString()}`,
    `${x.toString()},${(y + size / 2).toString()}`,
    `${x.toString()},${(y + size / 4).toString()}`,
    `${x.toString()},${(y - size / 4).toString()}`,
    `${x.toString()},${(y - size / 2).toString()}`,
  ].join("L");
  return `M${path}Z`;
}

export { getHexagonPath, getDegenerateHexagonPath };
