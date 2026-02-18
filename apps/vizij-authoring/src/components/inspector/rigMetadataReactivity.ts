export type NumericRange = {
  min: number;
  max: number;
};

export type RigMetadataReactivityResult = {
  range: NumericRange;
  defaultValue: number;
  value: number;
};

function clampToRange(value: number, range: NumericRange): number {
  return Math.min(Math.max(value, range.min), range.max);
}

export function resolveRigMetadataReactivity(options: {
  currentValue: number | null | undefined;
  nextDefaultValue: number;
  nextRange: NumericRange;
}): RigMetadataReactivityResult {
  const min = Math.min(options.nextRange.min, options.nextRange.max);
  const max = Math.max(options.nextRange.min, options.nextRange.max);
  const normalizedRange = { min, max };
  const normalizedDefaultValue = clampToRange(
    options.nextDefaultValue,
    normalizedRange,
  );
  const valueSource = Number.isFinite(options.currentValue)
    ? (options.currentValue as number)
    : normalizedDefaultValue;

  return {
    range: normalizedRange,
    defaultValue: normalizedDefaultValue,
    value: clampToRange(valueSource, normalizedRange),
  };
}
