/**
 * Converts Euler angles to a 3x3 rotation matrix.
 * Uses ZYX order (intrinsic rotations).
 *
 * @param euler - Array of three numbers representing rotation angles in radians [z, y, x]
 * @returns A 3x3 rotation matrix as a nested array
 *
 * @example
 * ```typescript
 * const matrix = eulerToRotationMatrix([0, Math.PI/2, 0]);
 * ```
 */
export function eulerToRotationMatrix(
  euler: [number, number, number],
): number[][] {
  const [z, y, x] = euler;

  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cx = Math.cos(x);
  const sx = Math.sin(x);

  // Rotation matrix for ZYX order
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}

/**
 * Calculates the angle of rotation from a rotation matrix.
 *
 * @param R - A 3x3 rotation matrix as a nested array
 * @returns The angle of rotation in radians
 */
export function rotationMatrixToAngle(R: number[][]): number {
  // Angle of rotation from rotation matrix
  // Angle = acos((trace(R) - 1) / 2)
  const trace = R[0][0] + R[1][1] + R[2][2];
  return Math.acos((trace - 1) / 2);
}

/**
 * Calculates the angular distance between two orientations specified by Euler angles.
 *
 * @param euler1 - First orientation in Euler angles [z, y, x] in radians
 * @param euler2 - Second orientation in Euler angles [z, y, x] in radians
 * @returns The angular distance in radians
 *
 * @example
 * ```typescript
 * const distance = angularDistance([0, 0, 0], [0, Math.PI/2, 0]);
 * ```
 */
export function angularDistance(
  euler1: [number, number, number],
  euler2: [number, number, number],
): number {
  const R1 = eulerToRotationMatrix(euler1);
  const R2 = eulerToRotationMatrix(euler2);

  // Calculate the relative rotation matrix
  const R12 = [
    [
      R1[0][0] * R2[0][0] + R1[0][1] * R2[1][0] + R1[0][2] * R2[2][0],
      R1[0][0] * R2[0][1] + R1[0][1] * R2[1][1] + R1[0][2] * R2[2][1],
      R1[0][0] * R2[0][2] + R1[0][1] * R2[1][2] + R1[0][2] * R2[2][2],
    ],
    [
      R1[1][0] * R2[0][0] + R1[1][1] * R2[1][0] + R1[1][2] * R2[2][0],
      R1[1][0] * R2[0][1] + R1[1][1] * R2[1][1] + R1[1][2] * R2[2][1],
      R1[1][0] * R2[0][2] + R1[1][1] * R2[1][2] + R1[1][2] * R2[2][2],
    ],
    [
      R1[2][0] * R2[0][0] + R1[2][1] * R2[1][0] + R1[2][2] * R2[2][0],
      R1[2][0] * R2[0][1] + R1[2][1] * R2[1][1] + R1[2][2] * R2[2][1],
      R1[2][0] * R2[0][2] + R1[2][1] * R2[1][2] + R1[2][2] * R2[2][2],
    ],
  ];

  // Calculate the angular distance
  return rotationMatrixToAngle(R12);
}

/**
 * Converts Euler angles (ZYX order) to a quaternion.
 *
 * @param euler - Array of three numbers representing rotation angles in radians [z, y, x]
 * @returns A quaternion as [w, x, y, z]
 */
export function eulerToQuaternion(
  euler: [number, number, number],
): [number, number, number, number] {
  const [z, y, x] = euler;

  const cx = Math.cos(x * 0.5);
  const sx = Math.sin(x * 0.5);
  const cy = Math.cos(y * 0.5);
  const sy = Math.sin(y * 0.5);
  const cz = Math.cos(z * 0.5);
  const sz = Math.sin(z * 0.5);

  // ZYX order quaternion composition
  const w = cx * cy * cz + sx * sy * sz;
  const qx = sx * cy * cz - cx * sy * sz;
  const qy = cx * sy * cz + sx * cy * sz;
  const qz = cx * cy * sz - sx * sy * cz;

  return [w, qx, qy, qz];
}

/**
 * Converts a quaternion to Euler angles (ZYX order).
 *
 * @param q - A quaternion as [w, x, y, z]
 * @returns Euler angles as [z, y, x] in radians
 */
export function quaternionToEuler(
  q: [number, number, number, number],
): [number, number, number] {
  const [w, x, y, z] = q;

  // Roll (x-axis rotation)
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch;
  if (Math.abs(sinp) >= 1) {
    pitch = (Math.sign(sinp) * Math.PI) / 2; // Use 90 degrees if out of range
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (z-axis rotation)
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  return [yaw, pitch, roll]; // [z, y, x]
}

/**
 * Multiplies two quaternions.
 *
 * @param q1 - First quaternion as [w, x, y, z]
 * @param q2 - Second quaternion as [w, x, y, z]
 * @returns The product quaternion as [w, x, y, z]
 */
export function quaternionMultiply(
  q1: [number, number, number, number],
  q2: [number, number, number, number],
): [number, number, number, number] {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;

  const w = w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2;
  const x = w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2;
  const y = w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2;
  const z = w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2;

  return [w, x, y, z];
}

/**
 * Calculates the conjugate of a quaternion (inverse for unit quaternions).
 *
 * @param q - A quaternion as [w, x, y, z]
 * @returns The conjugate quaternion as [w, -x, -y, -z]
 */
export function quaternionConjugate(
  q: [number, number, number, number],
): [number, number, number, number] {
  const [w, x, y, z] = q;
  return [w, -x, -y, -z];
}

/**
 * Performs spherical linear interpolation between two quaternions.
 *
 * @param q1 - First quaternion as [w, x, y, z]
 * @param q2 - Second quaternion as [w, x, y, z]
 * @param t - Interpolation factor. Values between 0-1 interpolate, outside this range extrapolate.
 *           t=0 returns q1, t=1 returns q2, t<0 extrapolates backwards, t>1 extrapolates forwards.
 * @returns The interpolated/extrapolated quaternion as [w, x, y, z]
 */
export function quaternionSlerp(
  q1: [number, number, number, number],
  q2: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;

  // Compute the cosine of the angle between the two quaternions
  let dot = w1 * w2 + x1 * x2 + y1 * y2 + z1 * z2;

  // If the dot product is negative, slerp won't take the shorter path.
  // Note that q1 and -q1 are equivalent when representing rotations.
  let q2Adjusted = [w2, x2, y2, z2] as [number, number, number, number];
  if (dot < 0) {
    q2Adjusted = [-w2, -x2, -y2, -z2];
    dot = -dot;
  }

  // If the inputs are too close for comfort, linearly interpolate
  const DOT_THRESHOLD = 0.9995;
  if (dot > DOT_THRESHOLD) {
    const result: [number, number, number, number] = [
      w1 + t * (q2Adjusted[0] - w1),
      x1 + t * (q2Adjusted[1] - x1),
      y1 + t * (q2Adjusted[2] - y1),
      z1 + t * (q2Adjusted[3] - z1),
    ];

    // Normalize the result
    const length = Math.sqrt(
      result[0] * result[0] +
        result[1] * result[1] +
        result[2] * result[2] +
        result[3] * result[3],
    );
    return [
      result[0] / length,
      result[1] / length,
      result[2] / length,
      result[3] / length,
    ];
  }

  // Calculate the angle between the quaternions
  const theta0 = Math.acos(Math.abs(dot));
  const sinTheta0 = Math.sin(theta0);

  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);

  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return [
    s0 * w1 + s1 * q2Adjusted[0],
    s0 * x1 + s1 * q2Adjusted[1],
    s0 * y1 + s1 * q2Adjusted[2],
    s0 * z1 + s1 * q2Adjusted[3],
  ];
}

/**
 * Performs spherical linear interpolation between two Euler angles.
 *
 * @param euler1 - First Euler angle [z, y, x] in radians
 * @param euler2 - Second Euler angle [z, y, x] in radians
 * @param t - Interpolation factor. Values between 0-1 interpolate, outside this range extrapolate.
 *           t=0 returns euler1, t=1 returns euler2, t<0 extrapolates backwards, t>1 extrapolates forwards.
 * @returns The interpolated/extrapolated Euler angle [z, y, x] in radians
 *
 * @example
 * ```typescript
 * const from = [0, 0, 0];
 * const to = [Math.PI, Math.PI/2, 0];
 * const halfway = eulerSlerp(from, to, 0.5);        // 50% interpolation
 * const extrapolated = eulerSlerp(from, to, 1.5);   // 150% - extrapolates beyond 'to'
 * const backwards = eulerSlerp(from, to, -0.5);     // Extrapolates backwards from 'from'
 * ```
 */
export function eulerSlerp(
  euler1: [number, number, number],
  euler2: [number, number, number],
  t: number,
): [number, number, number] {
  // Convert Euler angles to quaternions
  const q1 = eulerToQuaternion(euler1);
  const q2 = eulerToQuaternion(euler2);

  // Perform quaternion slerp
  const qResult = quaternionSlerp(q1, q2, t);

  // Convert result back to Euler angles
  return quaternionToEuler(qResult);
}

/**
 * Calculates the euler angle that represents the rotation matrix from one euler angle to another.
 * @param euler1 - The first euler angle [z, y, x] in radians (source orientation)
 * @param euler2 - The second euler angle [z, y, x] in radians (destination orientation)
 * @return The euler angle representing the rotation from euler1 to euler2 [z, y, x] in radians
 */
export function eulerRotationBetween(
  euler1: [number, number, number],
  euler2: [number, number, number],
): [number, number, number] {
  // Convert both Euler angles to quaternions
  const q1 = eulerToQuaternion(euler1);
  const q2 = eulerToQuaternion(euler2);

  // Calculate the rotation difference: q_diff = q2 * q1^-1
  const q1Conjugate = quaternionConjugate(q1);
  const qDiff = quaternionMultiply(q2, q1Conjugate);

  // Convert the difference quaternion back to Euler angles
  return quaternionToEuler(qDiff);
}
