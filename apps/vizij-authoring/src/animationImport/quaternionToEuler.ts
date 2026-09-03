/**
 * Quaternion -> euler conversion for imported rotation channels.
 *
 * glTF stores node rotation as a quaternion; Vizij's rotation animatable is an
 * `AnimatableEuler` in radians, applied by the renderer with euler order
 * **ZYX** (`rotation.set(x, y, z, "ZYX")` in every renderable — shape, group,
 * ellipse, rectangle). Converting with any other order produces a rotation
 * that looks right at rest and wrong as soon as two axes move together, so the
 * order is asserted by tests against Three.js rather than assumed.
 *
 * Implemented without importing Three so the whole import path stays
 * dependency-free and testable in plain Node; the tests verify agreement with
 * `THREE.Euler.setFromQuaternion(q, "ZYX")` key by key.
 */

export interface EulerCurves {
  x: number[];
  y: number[];
  z: number[];
  /**
   * Keys that landed within `GIMBAL_EPSILON` of the ZYX singularity, where one
   * angle becomes indeterminate and the decomposition forces `x = 0`. Adjacent
   * keys straddling it can jump, so callers surface this rather than hide it.
   */
  gimbalKeyCount: number;
  /** Keys where the quaternion was negated to keep the path continuous. */
  signFlipCount: number;
}

/** Beyond this, `asin` saturates and the ZYX decomposition degenerates. */
const GIMBAL_EPSILON = 0.9999999;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Euler angles (ZYX order, radians) for one normalized quaternion.
 *
 * Mirrors `THREE.Euler.setFromRotationMatrix` for the `ZYX` case, with the
 * rotation matrix expanded directly from the quaternion.
 */
export function quaternionToEulerZYX(
  x: number,
  y: number,
  z: number,
  w: number,
): { x: number; y: number; z: number; gimbal: boolean } {
  // Normalize defensively: exported quaternions are occasionally slightly off
  // unit length, which would bias `asin` near the singularity.
  const length = Math.hypot(x, y, z, w);
  if (length === 0) {
    return { x: 0, y: 0, z: 0, gimbal: false };
  }
  const qx = x / length;
  const qy = y / length;
  const qz = z / length;
  const qw = w / length;

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  // Only the matrix elements the ZYX decomposition reads are expanded; m13 and
  // m23 belong to other euler orders and would be dead weight here.
  const m11 = 1 - (yy + zz);
  const m12 = xy - wz;
  const m21 = xy + wz;
  const m22 = 1 - (xx + zz);
  const m31 = xz - wy;
  const m32 = yz + wx;
  const m33 = 1 - (xx + yy);

  // THREE.Euler, order "ZYX".
  const eulerY = Math.asin(-clamp(m31, -1, 1));
  const gimbal = Math.abs(m31) >= GIMBAL_EPSILON;
  if (!gimbal) {
    return {
      x: Math.atan2(m32, m33),
      y: eulerY,
      z: Math.atan2(m21, m11),
      gimbal,
    };
  }
  return {
    x: 0,
    y: eulerY,
    z: Math.atan2(-m12, m22),
    gimbal,
  };
}

/**
 * Makes an angle sequence continuous by shifting each value into the branch
 * nearest its predecessor.
 *
 * `atan2` returns values in `(-π, π]`, so a rotation passing through π reads as
 * a jump from `+π` to `-π`. Left alone, the timeline shows a 360° snap the
 * source never had, and any interpolation across that pair spins the object
 * the wrong way.
 */
export function unwrapAngles(values: ReadonlyArray<number>): number[] {
  const out: number[] = [];
  let previous = 0;
  values.forEach((value, index) => {
    if (index === 0) {
      previous = value;
      out.push(value);
      return;
    }
    let next = value;
    while (next - previous > Math.PI) {
      next -= 2 * Math.PI;
    }
    while (previous - next > Math.PI) {
      next += 2 * Math.PI;
    }
    previous = next;
    out.push(next);
  });
  return out;
}

/**
 * Converts a quaternion keyframe sequence into three continuous euler curves.
 *
 * Two corrections are applied, in this order, and both matter:
 *
 * 1. **Sign continuity.** `q` and `-q` are the same rotation, and exporters
 *    emit either. Converting a sign-flipped pair independently yields euler
 *    values on opposite branches, so each quaternion is negated when its dot
 *    product with the previous one is negative.
 * 2. **Angle unwrapping.** Applied per channel after conversion, to remove
 *    `atan2` branch cuts.
 *
 * @param values Flat quaternion components (x, y, z, w) per key.
 */
export function quaternionCurveToEulerZYX(
  values: ReadonlyArray<number>,
  keyCount: number,
): EulerCurves {
  const rawX: number[] = [];
  const rawY: number[] = [];
  const rawZ: number[] = [];
  let gimbalKeyCount = 0;
  let signFlipCount = 0;

  let previous: [number, number, number, number] | null = null;

  for (let index = 0; index < keyCount; index += 1) {
    const base = index * 4;
    let qx = values[base] ?? 0;
    let qy = values[base + 1] ?? 0;
    let qz = values[base + 2] ?? 0;
    let qw = values[base + 3] ?? 1;

    if (previous) {
      const dot =
        previous[0] * qx +
        previous[1] * qy +
        previous[2] * qz +
        previous[3] * qw;
      if (dot < 0) {
        qx = -qx;
        qy = -qy;
        qz = -qz;
        qw = -qw;
        signFlipCount += 1;
      }
    }
    previous = [qx, qy, qz, qw];

    const euler = quaternionToEulerZYX(qx, qy, qz, qw);
    if (euler.gimbal) {
      gimbalKeyCount += 1;
    }
    rawX.push(euler.x);
    rawY.push(euler.y);
    rawZ.push(euler.z);
  }

  return {
    x: unwrapAngles(rawX),
    y: unwrapAngles(rawY),
    z: unwrapAngles(rawZ),
    gimbalKeyCount,
    signFlipCount,
  };
}
