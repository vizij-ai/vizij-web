/**
 * The error a load ends with when the GLB holds no face: no element carries
 * `RobotData`, and the aggressive import finds no mesh, ellipse or rectangle
 * to make one from.
 */
export class EmptyModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyModelError";
  }
}
