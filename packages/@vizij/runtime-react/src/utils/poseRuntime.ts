export function shouldUseLegacyPoseWeightFallback(hasPoseGraph: boolean) {
  return !hasPoseGraph;
}

export function resolvePoseControlInputPath({
  inputId,
  basePath,
  rigInputPathMap,
  hasNativePoseControlInput,
}: {
  inputId: string;
  basePath: string;
  rigInputPathMap: Record<string, string>;
  hasNativePoseControlInput: boolean;
}): string | undefined {
  if (!inputId.trim()) {
    return undefined;
  }

  return (
    rigInputPathMap[inputId] ??
    rigInputPathMap[`pose_control_${inputId}`] ??
    rigInputPathMap[`direct_${inputId}`] ??
    (hasNativePoseControlInput ? basePath : undefined)
  );
}
