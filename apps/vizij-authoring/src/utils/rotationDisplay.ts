import type { RotationDisplayMode } from "../state/AuthoringUiProvider";

const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

export function isRotationPropertyKey(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }
  return (
    normalized === "rotation" ||
    normalized.includes("rotation") ||
    normalized.includes("angle") ||
    normalized.includes("euler")
  );
}

export function shouldDisplayRotationInDegrees(
  value: string | null | undefined,
  mode: RotationDisplayMode,
): boolean {
  return mode === "degrees" && isRotationPropertyKey(value);
}

export function radiansToDegrees(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value * DEGREES_PER_RADIAN;
}

export function degreesToRadians(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value * RADIANS_PER_DEGREE;
}

/**
 * Decimals kept when showing an angle in degrees. Four matches the app's numeric
 * field contract, and 0.0001° is ~1.7e-6 rad — far below any tolerance a rig cares
 * about, so nothing meaningful is lost.
 */
const DISPLAY_DECIMALS = 4;
const DISPLAY_SCALE = 10 ** DISPLAY_DECIMALS;

/**
 * Converts a stored angle to what the user should see.
 *
 * **Rounds, and has to.** `radiansToDegrees` is exact float arithmetic, so a stored
 * `Math.PI / 6` reached the inspector as `29.999999999999996` and rendered that way
 * in a live rotation field (`Math.PI / 3` gave `59.99999999999999`). The unit tests
 * compare with `toBeCloseTo(…, 6)`, so they could not see it.
 *
 * Rounding belongs here rather than in `radiansToDegrees`, which stays pure: this is
 * the display boundary, and every call site pairs it with `fromRotationDisplayValue`
 * for the write path. So this affects what is shown, never what is stored — and if
 * the user does edit, they are editing the number they were actually shown, which is
 * the point.
 */
export function toRotationDisplayValue(
  value: number,
  mode: RotationDisplayMode,
): number {
  if (mode !== "degrees") {
    return value;
  }
  const degrees = radiansToDegrees(value);
  // Guard the scale-up: beyond ~9e11 degrees, `degrees * 1e4` exceeds the exact
  // integer range and rounding would corrupt rather than clean. No real rotation
  // gets close, but silently mangling a value is worse than leaving it alone.
  if (!Number.isFinite(degrees) || Math.abs(degrees) > 9e11) {
    return degrees;
  }
  return Math.round(degrees * DISPLAY_SCALE) / DISPLAY_SCALE;
}

export function fromRotationDisplayValue(
  value: number,
  mode: RotationDisplayMode,
): number {
  return mode === "degrees" ? degreesToRadians(value) : value;
}
