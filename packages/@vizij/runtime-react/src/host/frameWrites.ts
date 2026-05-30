import { getLookup, type RawValue } from "@vizij/utils";
import type { ValueJSON, WriteOp } from "@vizij/orchestrator-react";
import { normalisePath, stripNamespace } from "@vizij/studio-support";
import type { RuntimeOutputWrite } from "../types";
import { valueJSONToRaw } from "../utils/valueConversion";
import { resolvePoseControlInputPath } from "../utils/poseRuntime";

const POSE_CONTROL_BRIDGE_EPSILON = 1e-6;

export type RuntimeFrameWriteInput = {
  writes: WriteOp[];
  namespace: string;
  namespacedOutputPaths: Set<string>;
  baseOutputPaths: Set<string>;
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
  poseControlInputs: Array<{ path: string; value: ValueJSON }>;
};

export function prepareRuntimeFrameWrites(
  args: RuntimeFrameWriteInput,
): PreparedRuntimeFrameWrites {
  const rendererWrites: RuntimeOutputWrite[] = [];
  const poseControlInputs: Array<{ path: string; value: ValueJSON }> = [];

  args.writes.forEach((write) => {
    const path = normalisePath(write.path);
    const basePath = stripNamespace(path, args.namespace);
    const isTrackedOutput =
      args.namespacedOutputPaths.has(path) ||
      args.baseOutputPaths.has(basePath);
    if (!isTrackedOutput) {
      return;
    }

    const raw = valueJSONToRaw(write.value);
    if (raw === undefined) {
      return;
    }

    maybeBridgePoseControlInput({
      basePath,
      raw,
      namespace: args.namespace,
      rigInputPathMap: args.rigInputPathMap,
      rigPoseControlInputIds: args.rigPoseControlInputIds,
      poseControlBridgeValues: args.poseControlBridgeValues,
      poseControlInputs,
    });

    const targetPath = args.baseOutputPaths.has(basePath) ? basePath : path;
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

function maybeBridgePoseControlInput(args: {
  basePath: string;
  raw: RawValue;
  namespace: string;
  rigInputPathMap: Record<string, string>;
  rigPoseControlInputIds: Set<string>;
  poseControlBridgeValues: Map<string, number>;
  poseControlInputs: Array<{ path: string; value: ValueJSON }>;
}) {
  const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
    args.basePath,
  );
  if (
    !poseControlMatch ||
    typeof args.raw !== "number" ||
    !Number.isFinite(args.raw)
  ) {
    return;
  }

  const inputId = (poseControlMatch[1] ?? "").trim();
  const hasNativePoseControlInput =
    inputId.length > 0 && args.rigPoseControlInputIds.has(inputId);
  const mappedInputPath =
    inputId.length === 0
      ? undefined
      : resolvePoseControlInputPath({
          inputId,
          basePath: args.basePath,
          rigInputPathMap: args.rigInputPathMap,
          hasNativePoseControlInput,
        });
  if (!mappedInputPath) {
    return;
  }

  const bridgeKey = `${args.namespace}:${mappedInputPath}`;
  const previousValue = args.poseControlBridgeValues.get(bridgeKey);
  if (
    previousValue !== undefined &&
    Math.abs(previousValue - args.raw) <= POSE_CONTROL_BRIDGE_EPSILON
  ) {
    return;
  }

  args.poseControlBridgeValues.set(bridgeKey, args.raw);
  args.poseControlInputs.push({
    path: mappedInputPath,
    value: { float: args.raw },
  });
}
