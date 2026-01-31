import type { AnimatableValue, RawValue } from "@vizij/utils";

function roundNumber(value: number): number {
  const rounded = Number.parseFloat(value.toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeRawValue(value: RawValue): RawValue {
  if (typeof value === "number") {
    return roundNumber(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "number") {
        return roundNumber(item);
      }
      if (item && typeof item === "object") {
        return normalizeRawValue(item as RawValue);
      }
      return item;
    }) as unknown as RawValue;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(
      value as unknown as Record<string, unknown>,
    ).map(([key, entryValue]) => {
      if (typeof entryValue === "number") {
        return [key, roundNumber(entryValue)];
      }
      if (
        entryValue &&
        typeof entryValue === "object" &&
        !(entryValue instanceof Date)
      ) {
        return [key, normalizeRawValue(entryValue as RawValue)];
      }
      return [key, entryValue];
    });
    return Object.fromEntries(entries) as unknown as RawValue;
  }

  return value;
}

export function formatRawValue(value: RawValue | undefined): string {
  if (value === undefined || value === null) {
    return "—";
  }

  if (typeof value === "number") {
    const rounded = roundNumber(value);
    return `${rounded}`;
  }

  if (typeof value === "boolean" || typeof value === "string") {
    return String(value);
  }

  const normalized = normalizeRawValue(value);
  if (typeof normalized === "number") {
    return `${normalized}`;
  }
  if (typeof normalized === "boolean" || typeof normalized === "string") {
    return String(normalized);
  }
  return JSON.stringify(normalized);
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
