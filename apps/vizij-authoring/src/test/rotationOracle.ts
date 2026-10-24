/**
 * Rotations built axis by axis, for tests to check the transform math
 * against without reusing it.
 *
 * A ZYX euler rotation R = Rz(z)·Ry(y)·Rx(x) is the Hamilton product
 * qz·qy·qx of the three single-axis quaternions, since the product of two
 * quaternions is the composition of their rotations.
 */

export interface OracleQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function axisQuaternion(
  axis: "x" | "y" | "z",
  angle: number,
): OracleQuat {
  const s = Math.sin(angle / 2);
  return {
    x: axis === "x" ? s : 0,
    y: axis === "y" ? s : 0,
    z: axis === "z" ? s : 0,
    w: Math.cos(angle / 2),
  };
}

/** The Hamilton product a·b: rotate by b, then by a. */
export function multiplyQuaternions(a: OracleQuat, b: OracleQuat): OracleQuat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** The quaternion of Rz(z)·Ry(y)·Rx(x). */
export function eulerZYXQuaternion(
  x: number,
  y: number,
  z: number,
): OracleQuat {
  return multiplyQuaternions(
    axisQuaternion("z", z),
    multiplyQuaternions(axisQuaternion("y", y), axisQuaternion("x", x)),
  );
}

export function quaternionDot(a: OracleQuat, b: OracleQuat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** `v` rotated by the unit quaternion `q`: q·v·q⁻¹. */
export function rotateVector(
  q: OracleQuat,
  v: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const conjugate = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  const rotated = multiplyQuaternions(
    multiplyQuaternions(q, { ...v, w: 0 }),
    conjugate,
  );
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}
