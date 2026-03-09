import type { RotationDisplayMode } from "../state/AuthoringUiProvider";

const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

export function isRotationPropertyKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "rotation" ||
    normalized.includes("rotation") ||
    normalized.includes("angle") ||
    normalized.includes("euler")
  );
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

export function toRotationDisplayValue(
  value: number,
  mode: RotationDisplayMode,
): number {
  return mode === "degrees" ? radiansToDegrees(value) : value;
}

export function fromRotationDisplayValue(
  value: number,
  mode: RotationDisplayMode,
): number {
  return mode === "degrees" ? degreesToRadians(value) : value;
}
