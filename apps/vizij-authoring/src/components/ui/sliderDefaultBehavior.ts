interface SliderDefaultBehaviorOptions {
  defaultValue?: number;
  min: number;
  max: number;
  step?: number;
  snapThreshold?: number;
}

export function hasSliderDefaultMarker({
  defaultValue,
  min,
  max,
}: SliderDefaultBehaviorOptions): boolean {
  return (
    Number.isFinite(defaultValue) &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    max > min &&
    (defaultValue as number) >= min &&
    (defaultValue as number) <= max
  );
}

export function resolveSliderDefaultPercent(
  options: SliderDefaultBehaviorOptions,
): number | null {
  if (!hasSliderDefaultMarker(options)) {
    return null;
  }
  return (
    ((options.defaultValue! - options.min) / (options.max - options.min)) * 100
  );
}

export function resolveSliderSnapThreshold({
  min,
  max,
  step = 1,
  snapThreshold,
}: SliderDefaultBehaviorOptions): number {
  if (Number.isFinite(snapThreshold) && (snapThreshold as number) >= 0) {
    return snapThreshold as number;
  }
  const range = Math.abs(max - min);
  const normalizedStep =
    Number.isFinite(step) && step > 0 ? step : range > 0 ? range / 100 : 1;
  return Math.max(normalizedStep * 4, range * 0.01);
}

export function resolveSnappedSliderValue(
  value: number,
  options: SliderDefaultBehaviorOptions,
): number {
  if (!hasSliderDefaultMarker(options)) {
    return value;
  }
  const threshold = resolveSliderSnapThreshold(options);
  return Math.abs(value - options.defaultValue!) <= threshold
    ? options.defaultValue!
    : value;
}
