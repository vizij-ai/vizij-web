import type { AnimatableValue, RawValue } from "@vizij/utils";

export function formatRawValue(value: RawValue | undefined): string {
  if (value === undefined || value === null) {
    return "—";
  }

  if (typeof value === "number") {
    const rounded = Number.parseFloat(value.toFixed(4));
    return `${rounded}`;
  }

  if (typeof value === "boolean" || typeof value === "string") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function formatConstraints(
  animatable: AnimatableValue | undefined,
): string | undefined {
  if (!animatable) {
    return undefined;
  }

  const entries = Object.entries(animatable.constraints ?? {}).filter(
    ([, constraintValue]) =>
      constraintValue !== undefined && constraintValue !== null,
  );

  if (!entries.length) {
    return undefined;
  }

  return entries
    .map(
      ([key, constraintValue]) => `${key}: ${JSON.stringify(constraintValue)}`,
    )
    .join(" · ");
}
