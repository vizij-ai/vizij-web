/*
@description
This function returns a string that represents the path of a hexagon for usage in svg paths.
It also includes a set of flanges on the top and bottom of the hexagon to provide a marker in the timeline
@param x - the x coordinate of the center of the hexagon
@param y - the y coordinate of the center of the hexagon
@param size - the size of the hexagon
@param height - the height of the entire path, including flanges
@return - the path of the hexagon
*/
function getHexagonPath(x: number, y: number, size: number, height: number): string {
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

/*
@description
This function returns a string that represents the path of a degenerate hexagon for usage in svg paths.
Specifically, this path appears as a single vertical line, but has the same number of vertices as the hexacon generation
function above, and can therefore be smoothly interpolated.
@param x - the x coordinate of the center of the hexagon
@param y - the y coordinate of the center of the hexagon
@param size - the size of the hexagon
@param height - the height of the entire path, including flanges
@return - the path of the degenerate hexagon
*/
function getDegenerateHexagonPath(x: number, y: number, size: number, height: number): string {
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
