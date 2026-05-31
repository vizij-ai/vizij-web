import type { PoseRigConfig, ValueJSON } from "../types";
import { buildPoseWeightPathMap, buildRigInputPath } from "./posePaths";

const POSE_CONTROL_BRIDGE_EPSILON = 1e-6;

export type LegacyPoseWeightFallbackMap = Map<string, Record<string, number>>;

export type LegacyPoseWeightControlWrite = {
  path: string;
  value: number;
};

export type PoseControlBridgeState = {
  previousValues: Map<string, number>;
};

export type PoseControlBridgeWrite = {
  path: string;
  value: ValueJSON;
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

export function planPoseControlBridgeWrite({
  basePath,
  rawValue,
  namespace,
  rigInputPathMap,
  rigPoseControlInputIds,
  state,
}: {
  basePath: string;
  rawValue: unknown;
  namespace: string;
  rigInputPathMap: Record<string, string>;
  rigPoseControlInputIds: Set<string>;
  state: PoseControlBridgeState;
}): PoseControlBridgeWrite | null {
  const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(basePath);
  if (
    !poseControlMatch ||
    typeof rawValue !== "number" ||
    !Number.isFinite(rawValue)
  ) {
    return null;
  }

  const inputId = (poseControlMatch[1] ?? "").trim();
  if (inputId.length === 0) {
    return null;
  }

  const hasNativePoseControlInput = rigPoseControlInputIds.has(inputId);
  const mappedInputPath = resolvePoseControlInputPath({
    inputId,
    basePath,
    rigInputPathMap,
    hasNativePoseControlInput,
  });
  if (!mappedInputPath) {
    return null;
  }

  const bridgeKey = `${namespace}:${mappedInputPath}`;
  const previousValue = state.previousValues.get(bridgeKey);
  if (
    previousValue !== undefined &&
    Math.abs(previousValue - rawValue) <= POSE_CONTROL_BRIDGE_EPSILON
  ) {
    return null;
  }

  state.previousValues.set(bridgeKey, rawValue);
  return {
    path: mappedInputPath,
    value: { float: rawValue },
  };
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
