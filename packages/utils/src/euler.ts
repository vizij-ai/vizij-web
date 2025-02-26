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
export function eulerToRotationMatrix(euler: [number, number, number]): number[][] {
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
