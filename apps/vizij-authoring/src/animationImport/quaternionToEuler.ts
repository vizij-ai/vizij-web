/**
 * Quaternion -> euler conversion for imported rotation channels.
 *
 * glTF stores node rotation as a quaternion; Vizij's rotation animatable is an
 * `AnimatableEuler` in radians, applied in euler order **ZYX**
 * (R = Rz·Ry·Rx, see `utils/transformMath`). Converting with any other order
 * produces a rotation that looks right at rest and wrong as soon as two axes
 * move together, so the tests pin the order against rotations composed axis
 * by axis rather than assume it.
 */

import { eulerZYXFromQuaternion } from "../utils/transformMath";

export interface EulerCurves {
  x: number[];
  y: number[];
  z: number[];
  /**
   * Keys that landed within `eulerZYXFromQuaternion`'s tolerance of the ZYX
   * singularity, where one angle becomes indeterminate and the decomposition
   * forces `x = 0`. Adjacent keys straddling it can jump, so callers surface
   * this rather than hide it.
   */
  gimbalKeyCount: number;
  /** Keys where the quaternion was negated to keep the path continuous. */
  signFlipCount: number;
}

/**
 * Euler angles (ZYX order, radians) for one quaternion, normalized first.
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
  return eulerZYXFromQuaternion({
    x: x / length,
    y: y / length,
    z: z / length,
    w: w / length,
  });
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
