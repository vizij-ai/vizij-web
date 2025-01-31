/**
 * Converts an angle from radians to degrees.
 *
 * @param radians - The angle in radians
 * @returns The angle in degrees
 *
 * @example
 * ```typescript
 * toDegrees(Math.PI) // Returns: 180
 * ```
 */
export const toDegrees = (radians: number) => radians * (180 / Math.PI);

/**
 * Converts an angle from degrees to radians.
 *
 * @param degrees - The angle in degrees
 * @returns The angle in radians
 *
 * @example
 * ```typescript
 * toRadians(180) // Returns: 3.141592653589793
 * ```
 */
export const toRadians = (degrees: number) => degrees * (Math.PI / 180);
