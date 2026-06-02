import { getLookup, type RawValue } from "@vizij/utils";
import type { WriteOp } from "@vizij/orchestrator-react";
import {
  normalisePath,
  planPoseControlBridgeWrite,
  stripNamespace,
  type PoseControlBridgeWrite,
} from "@vizij/studio-support";
import type { RuntimeOutputWrite } from "../types";
import { valueJSONToRaw } from "../utils/valueConversion";

export type RuntimeFrameWriteInput = {
  writes: WriteOp[];
  namespace: string;
  namespacedOutputPaths: Set<string>;
  baseOutputPaths: Set<string>;
  ignoredOutputPaths?: Set<string>;
  rendererTargetIds?: Set<string>;
  rigInputPathMap: Record<string, string>;
  rigPoseControlInputIds: Set<string>;
  poseControlBridgeValues: Map<string, number>;
  currentValues: Map<string, RawValue | undefined>;
  transformOutputWrite?: (
    write: RuntimeOutputWrite,
  ) => RuntimeOutputWrite | null;
};

export type PreparedRuntimeFrameWrites = {
  rendererWrites: RuntimeOutputWrite[];
  poseControlInputs: PoseControlBridgeWrite[];
};

function writeValueAsFloat(raw: RawValue): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function resolveRuntimeInputBridgePath(
  basePath: string,
  rigInputPathMap: Record<string, string>,
): string | null {
  const normalizedBasePath = normalisePath(basePath);
  const directMapped = rigInputPathMap[normalizedBasePath];
  if (directMapped?.trim()) {
    return normalisePath(directMapped);
  }

  const rigInputPaths = Object.values(rigInputPathMap)
    .map((path) => normalisePath(path))
    .filter(Boolean);
  if (rigInputPaths.includes(normalizedBasePath)) {
    return normalizedBasePath;
  }

  if (!normalizedBasePath.startsWith("rig/")) {
    const suffix = `/${normalizedBasePath}`;
    const suffixMatch = rigInputPaths.find((path) => path.endsWith(suffix));
    if (suffixMatch) {
      return suffixMatch;
    }
  }

  return null;
}

function planRuntimeInputBridgeWrite({
  basePath,
  rawValue,
  namespace,
  rigInputPathMap,
  previousValues,
}: {
  basePath: string;
  rawValue: RawValue;
  namespace: string;
  rigInputPathMap: Record<string, string>;
  previousValues: Map<string, number>;
}): PoseControlBridgeWrite | null {
  const value = writeValueAsFloat(rawValue);
  if (value === null) {
    return null;
  }

  const path = resolveRuntimeInputBridgePath(basePath, rigInputPathMap);
  if (!path) {
    return null;
  }

  const bridgeKey = `${namespace}:runtime-input:${path}`;
  const previousValue = previousValues.get(bridgeKey);
  if (previousValue !== undefined && Math.abs(previousValue - value) <= 1e-6) {
    return null;
  }

  previousValues.set(bridgeKey, value);
  return {
    path,
    value: { float: value },
  };
}

export function prepareRuntimeFrameWrites(
  args: RuntimeFrameWriteInput,
): PreparedRuntimeFrameWrites {
  const rendererWrites: RuntimeOutputWrite[] = [];
  const poseControlInputs: PoseControlBridgeWrite[] = [];

  args.writes.forEach((write) => {
    const path = normalisePath(write.path);
    const basePath = stripNamespace(path, args.namespace);
    const isTrackedOutput =
      args.namespacedOutputPaths.has(path) ||
      args.baseOutputPaths.has(basePath);
    if (!isTrackedOutput) {
      return;
    }
    if (
      args.ignoredOutputPaths?.has(path) ||
      args.ignoredOutputPaths?.has(basePath)
    ) {
      return;
    }

    const raw = valueJSONToRaw(write.value);
    if (raw === undefined) {
      return;
    }

    const bridgeWrite = planPoseControlBridgeWrite({
      basePath,
      rawValue: raw,
      namespace: args.namespace,
      rigInputPathMap: args.rigInputPathMap,
      rigPoseControlInputIds: args.rigPoseControlInputIds,
      state: { previousValues: args.poseControlBridgeValues },
    });
    if (bridgeWrite) {
      poseControlInputs.push(bridgeWrite);
    }

    const targetPath = args.baseOutputPaths.has(basePath) ? basePath : path;
    const runtimeInputBridgeWrite = planRuntimeInputBridgeWrite({
      basePath,
      rawValue: raw,
      namespace: args.namespace,
      rigInputPathMap: args.rigInputPathMap,
      previousValues: args.poseControlBridgeValues,
    });
    if (runtimeInputBridgeWrite) {
      poseControlInputs.push(runtimeInputBridgeWrite);
    }

    const hasRendererTarget =
      !args.rendererTargetIds || args.rendererTargetIds.has(targetPath);
    if (!hasRendererTarget) {
      return;
    }

    const currentValue = args.currentValues.get(
      getLookup(args.namespace, targetPath),
    );
    const nextWrite = args.transformOutputWrite
      ? args.transformOutputWrite({
          id: targetPath,
          namespace: args.namespace,
          value: raw,
          currentValue,
        })
      : {
          id: targetPath,
          namespace: args.namespace,
          value: raw,
        };
    if (nextWrite) {
      rendererWrites.push(nextWrite);
    }
  });

  return { rendererWrites, poseControlInputs };
}
