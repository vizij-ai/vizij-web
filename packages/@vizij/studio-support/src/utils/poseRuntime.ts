import type { PoseRigConfig } from "../types";
import { buildPoseWeightPathMap, buildRigInputPath } from "./posePaths";

export type LegacyPoseWeightFallbackMap = Map<string, Record<string, number>>;

export type LegacyPoseWeightControlWrite = {
  path: string;
  value: number;
};

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

export function buildLegacyPoseWeightFallbackMap({
  poseConfig,
  faceId,
}: {
  poseConfig?: Pick<PoseRigConfig, "faceId" | "poses"> | null;
  faceId?: string | null;
}): LegacyPoseWeightFallbackMap {
  const map: LegacyPoseWeightFallbackMap = new Map();
  if (!poseConfig) {
    return map;
  }

  const posePaths = buildPoseWeightPathMap(
    poseConfig.poses ?? [],
    poseConfig.faceId ?? faceId ?? "face",
  );
  (poseConfig.poses ?? []).forEach((pose) => {
    const posePath = posePaths.get(pose.id);
    if (!posePath) {
      return;
    }
    const values = Object.fromEntries(
      Object.entries(pose.values ?? {}).filter(([, value]) =>
        Number.isFinite(value),
      ),
    ) as Record<string, number>;
    map.set(posePath, values);
  });

  return map;
}

export function resolveLegacyPoseWeightControlWrites({
  enabled,
  poseWeightPath,
  poseWeightValue,
  poseWeightFallbackMap,
  faceId,
  rigInputPathMap,
}: {
  enabled: boolean;
  poseWeightPath: string;
  poseWeightValue: number | null | undefined;
  poseWeightFallbackMap: LegacyPoseWeightFallbackMap;
  faceId?: string | null;
  rigInputPathMap: Record<string, string>;
}): LegacyPoseWeightControlWrite[] {
  if (!enabled || poseWeightValue == null) {
    return [];
  }

  const poseValues = poseWeightFallbackMap.get(poseWeightPath);
  if (!poseValues) {
    return [];
  }

  const poseFaceId = faceId ?? "face";
  return Object.entries(poseValues).flatMap(([inputId, poseValue]) => {
    if (!Number.isFinite(poseValue)) {
      return [];
    }
    const basePath = buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
    const controlPath =
      resolvePoseControlInputPath({
        inputId,
        basePath,
        rigInputPathMap,
        hasNativePoseControlInput: true,
      }) ?? basePath;
    return [
      {
        path: controlPath,
        value: Number(poseValue) * poseWeightValue,
      },
    ];
  });
}
