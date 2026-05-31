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
