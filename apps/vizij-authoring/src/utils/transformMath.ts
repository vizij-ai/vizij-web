/**
 * Transform math for the world model, in the conventions faces are drawn and
 * exported with:
 *
 * - a `rotation` feature holds euler angles in radians, applied as
 *   R = Rz(z)·Ry(y)·Rx(x) — three.js's `"ZYX"` order, the order the Bevy view
 *   composes (`euler_zyx` in vizij-rs `crates/vizij/src/view`) and the GLB
 *   exporter writes;
 * - an element's local matrix is T·R·S, and its world matrix is its parent's
 *   world matrix times its local matrix;
 * - a matrix is 4×4, column-major: element `4 * column + row`.
 *
 * The algorithms are three.js's (`Matrix4.compose`, `multiplyMatrices`,
 * `invert`, `decompose`; `Quaternion.setFromEuler` and
 * `setFromRotationMatrix`; `Euler.setFromQuaternion`), so a quaternion
 * computed here is the one the exporter writes for the same euler angles.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 16 elements, column-major. */
export type Mat4 = readonly number[];

export const IDENTITY_MATRIX: Mat4 = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

/**
 * Beyond this, `asin` saturates and the ZYX decomposition degenerates: one
 * angle becomes indeterminate and `x` is set to 0.
 */
const GIMBAL_EPSILON = 0.9999999;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The quaternion of the rotation Rz(z)·Ry(y)·Rx(x), angles in radians. */
export function quaternionFromEulerZYX(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 - c1 * s2 * s3,
    y: c1 * s2 * c3 + s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };
}

/**
 * Euler angles (ZYX order, radians) of a unit quaternion.
 *
 * `gimbal` is set when the rotation lies within `GIMBAL_EPSILON` of the ZYX
 * singularity (`y` at ±π/2), where `x` is forced to 0 and `z` carries the
 * whole remaining rotation.
 */
export function eulerZYXFromQuaternion(q: Quat): Vec3 & { gimbal: boolean } {
  const x2 = q.x + q.x;
  const y2 = q.y + q.y;
  const z2 = q.z + q.z;
  const xx = q.x * x2;
  const xy = q.x * y2;
  const xz = q.x * z2;
  const yy = q.y * y2;
  const yz = q.y * z2;
  const zz = q.z * z2;
  const wx = q.w * x2;
  const wy = q.w * y2;
  const wz = q.w * z2;

  // The rotation matrix's elements the ZYX decomposition reads.
  const m11 = 1 - (yy + zz);
  const m12 = xy - wz;
  const m21 = xy + wz;
  const m22 = 1 - (xx + zz);
  const m31 = xz - wy;
  const m32 = yz + wx;
  const m33 = 1 - (xx + yy);

  const y = Math.asin(-clamp(m31, -1, 1));
  if (Math.abs(m31) < GIMBAL_EPSILON) {
    return {
      x: Math.atan2(m32, m33),
      y,
      z: Math.atan2(m21, m11),
      gimbal: false,
    };
  }
  return { x: 0, y, z: Math.atan2(-m12, m22), gimbal: true };
}

/** T·R·S, with R the rotation of the unit quaternion `rotation`. */
export function composeMatrix(
  translation: Vec3,
  rotation: Quat,
  scale: Vec3,
): Mat4 {
  const { x, y, z, w } = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = scale.x;
  const sy = scale.y;
  const sz = scale.z;

  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    translation.x,
    translation.y,
    translation.z,
    1,
  ];
}

/** The product a·b. */
export function multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
  const a11 = a[0]!,
    a12 = a[4]!,
    a13 = a[8]!,
    a14 = a[12]!;
  const a21 = a[1]!,
    a22 = a[5]!,
    a23 = a[9]!,
    a24 = a[13]!;
  const a31 = a[2]!,
    a32 = a[6]!,
    a33 = a[10]!,
    a34 = a[14]!;
  const a41 = a[3]!,
    a42 = a[7]!,
    a43 = a[11]!,
    a44 = a[15]!;

  const b11 = b[0]!,
    b12 = b[4]!,
    b13 = b[8]!,
    b14 = b[12]!;
  const b21 = b[1]!,
    b22 = b[5]!,
    b23 = b[9]!,
    b24 = b[13]!;
  const b31 = b[2]!,
    b32 = b[6]!,
    b33 = b[10]!,
    b34 = b[14]!;
  const b41 = b[3]!,
    b42 = b[7]!,
    b43 = b[11]!,
    b44 = b[15]!;

  return [
    a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41,
    a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41,
    a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41,
    a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41,

    a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42,
    a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42,
    a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42,
    a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42,

    a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43,
    a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43,
    a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43,
    a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43,

    a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44,
    a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44,
    a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44,
    a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44,
  ];
}

function determinant(m: Mat4): number {
  const n11 = m[0]!,
    n12 = m[4]!,
    n13 = m[8]!,
    n14 = m[12]!;
  const n21 = m[1]!,
    n22 = m[5]!,
    n23 = m[9]!,
    n24 = m[13]!;
  const n31 = m[2]!,
    n32 = m[6]!,
    n33 = m[10]!,
    n34 = m[14]!;
  const n41 = m[3]!,
    n42 = m[7]!,
    n43 = m[11]!,
    n44 = m[15]!;

  return (
    n41 *
      (+n14 * n23 * n32 -
        n13 * n24 * n32 -
        n14 * n22 * n33 +
        n12 * n24 * n33 +
        n13 * n22 * n34 -
        n12 * n23 * n34) +
    n42 *
      (+n11 * n23 * n34 -
        n11 * n24 * n33 +
        n14 * n21 * n33 -
        n13 * n21 * n34 +
        n13 * n24 * n31 -
        n14 * n23 * n31) +
    n43 *
      (+n11 * n24 * n32 -
        n11 * n22 * n34 -
        n14 * n21 * n32 +
        n12 * n21 * n34 +
        n14 * n22 * n31 -
        n12 * n24 * n31) +
    n44 *
      (-n13 * n22 * n31 -
        n11 * n23 * n32 +
        n11 * n22 * n33 +
        n13 * n21 * n32 -
        n12 * n21 * n33 +
        n12 * n23 * n31)
  );
}

/** The inverse of `m`; the zero matrix when `m` is singular. */
export function invertMatrix(m: Mat4): Mat4 {
  const n11 = m[0]!,
    n21 = m[1]!,
    n31 = m[2]!,
    n41 = m[3]!;
  const n12 = m[4]!,
    n22 = m[5]!,
    n32 = m[6]!,
    n42 = m[7]!;
  const n13 = m[8]!,
    n23 = m[9]!,
    n33 = m[10]!,
    n43 = m[11]!;
  const n14 = m[12]!,
    n24 = m[13]!,
    n34 = m[14]!,
    n44 = m[15]!;

  const t11 =
    n23 * n34 * n42 -
    n24 * n33 * n42 +
    n24 * n32 * n43 -
    n22 * n34 * n43 -
    n23 * n32 * n44 +
    n22 * n33 * n44;
  const t12 =
    n14 * n33 * n42 -
    n13 * n34 * n42 -
    n14 * n32 * n43 +
    n12 * n34 * n43 +
    n13 * n32 * n44 -
    n12 * n33 * n44;
  const t13 =
    n13 * n24 * n42 -
    n14 * n23 * n42 +
    n14 * n22 * n43 -
    n12 * n24 * n43 -
    n13 * n22 * n44 +
    n12 * n23 * n44;
  const t14 =
    n14 * n23 * n32 -
    n13 * n24 * n32 -
    n14 * n22 * n33 +
    n12 * n24 * n33 +
    n13 * n22 * n34 -
    n12 * n23 * n34;

  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det === 0) {
    return new Array<number>(16).fill(0);
  }
  const detInv = 1 / det;

  return [
    t11 * detInv,
    (n24 * n33 * n41 -
      n23 * n34 * n41 -
      n24 * n31 * n43 +
      n21 * n34 * n43 +
      n23 * n31 * n44 -
      n21 * n33 * n44) *
      detInv,
    (n22 * n34 * n41 -
      n24 * n32 * n41 +
      n24 * n31 * n42 -
      n21 * n34 * n42 -
      n22 * n31 * n44 +
      n21 * n32 * n44) *
      detInv,
    (n23 * n32 * n41 -
      n22 * n33 * n41 -
      n23 * n31 * n42 +
      n21 * n33 * n42 +
      n22 * n31 * n43 -
      n21 * n32 * n43) *
      detInv,

    t12 * detInv,
    (n13 * n34 * n41 -
      n14 * n33 * n41 +
      n14 * n31 * n43 -
      n11 * n34 * n43 -
      n13 * n31 * n44 +
      n11 * n33 * n44) *
      detInv,
    (n14 * n32 * n41 -
      n12 * n34 * n41 -
      n14 * n31 * n42 +
      n11 * n34 * n42 +
      n12 * n31 * n44 -
      n11 * n32 * n44) *
      detInv,
    (n12 * n33 * n41 -
      n13 * n32 * n41 +
      n13 * n31 * n42 -
      n11 * n33 * n42 -
      n12 * n31 * n43 +
      n11 * n32 * n43) *
      detInv,

    t13 * detInv,
    (n14 * n23 * n41 -
      n13 * n24 * n41 -
      n14 * n21 * n43 +
      n11 * n24 * n43 +
      n13 * n21 * n44 -
      n11 * n23 * n44) *
      detInv,
    (n12 * n24 * n41 -
      n14 * n22 * n41 +
      n14 * n21 * n42 -
      n11 * n24 * n42 -
      n12 * n21 * n44 +
      n11 * n22 * n44) *
      detInv,
    (n13 * n22 * n41 -
      n12 * n23 * n41 -
      n13 * n21 * n42 +
      n11 * n23 * n42 +
      n12 * n21 * n43 -
      n11 * n22 * n43) *
      detInv,

    t14 * detInv,
    (n13 * n24 * n31 -
      n14 * n23 * n31 +
      n14 * n21 * n33 -
      n11 * n24 * n33 -
      n13 * n21 * n34 +
      n11 * n23 * n34) *
      detInv,
    (n14 * n22 * n31 -
      n12 * n24 * n31 -
      n14 * n21 * n32 +
      n11 * n24 * n32 +
      n12 * n21 * n34 -
      n11 * n22 * n34) *
      detInv,
    (n12 * n23 * n31 -
      n13 * n22 * n31 +
      n13 * n21 * n32 -
      n11 * n23 * n32 -
      n12 * n21 * n33 +
      n11 * n22 * n33) *
      detInv,
  ];
}

/**
 * The quaternion of a pure rotation matrix: the upper 3×3 of `m`, unscaled.
 */
function quaternionFromRotationMatrix(m: Mat4): Quat {
  const m11 = m[0]!,
    m12 = m[4]!,
    m13 = m[8]!;
  const m21 = m[1]!,
    m22 = m[5]!,
    m23 = m[9]!;
  const m31 = m[2]!,
    m32 = m[6]!,
    m33 = m[10]!;
  const trace = m11 + m22 + m33;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    return {
      w: 0.25 / s,
      x: (m32 - m23) * s,
      y: (m13 - m31) * s,
      z: (m21 - m12) * s,
    };
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    return {
      w: (m32 - m23) / s,
      x: 0.25 * s,
      y: (m12 + m21) / s,
      z: (m13 + m31) / s,
    };
  }
  if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    return {
      w: (m13 - m31) / s,
      x: (m12 + m21) / s,
      y: 0.25 * s,
      z: (m23 + m32) / s,
    };
  }
  const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
  return {
    w: (m21 - m12) / s,
    x: (m13 + m31) / s,
    y: (m23 + m32) / s,
    z: 0.25 * s,
  };
}

function length(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Translation, rotation and scale of an affine matrix, such that
 * `composeMatrix` of them gives `m` back. A mirroring matrix (negative
 * determinant) carries its reflection in a negative `scale.x`.
 */
export function decomposeMatrix(m: Mat4): {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
} {
  let sx = length(m[0]!, m[1]!, m[2]!);
  const sy = length(m[4]!, m[5]!, m[6]!);
  const sz = length(m[8]!, m[9]!, m[10]!);
  if (determinant(m) < 0) {
    sx = -sx;
  }

  const invSX = 1 / sx;
  const invSY = 1 / sy;
  const invSZ = 1 / sz;
  const rotation = quaternionFromRotationMatrix([
    m[0]! * invSX,
    m[1]! * invSX,
    m[2]! * invSX,
    0,
    m[4]! * invSY,
    m[5]! * invSY,
    m[6]! * invSY,
    0,
    m[8]! * invSZ,
    m[9]! * invSZ,
    m[10]! * invSZ,
    0,
    0,
    0,
    0,
    1,
  ]);

  return {
    translation: { x: m[12]!, y: m[13]!, z: m[14]! },
    rotation,
    scale: { x: sx, y: sy, z: sz },
  };
}
