import { resolveAnimationBridgeOutputPaths } from "@vizij/studio-support";
import type { AnimationClipLike, AnimationTrackLike } from "../types";
import { sampleTrackAtTime } from "./clipPlayback";

export {
  collectAnimationClipOutputPaths,
  resolveAnimationBridgeOutputPaths,
} from "@vizij/studio-support";

export type AnimationAggregateOperation =
  | {
      kind: "set";
      path: string;
      value: number;
    }
  | {
      kind: "clear";
      path: string;
    };

export function sampleAnimationClipOutputValues(
  clip: AnimationClipLike,
  timeSeconds: number,
  weight = 1,
  faceId?: string,
  rigInputMap?: Record<string, string>,
): Map<string, number> {
  const appliedWeight =
    Number.isFinite(weight) && weight >= 0 ? Number(weight) : 1;
  const outputValues = new Map<string, number>();
  const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];

  tracks.forEach((track) => {
    const channel =
      typeof track.channel === "string" ? track.channel.trim() : "";
    if (!channel) {
      return;
    }

    const sampledValue = sampleTrackAtTime(
      track as AnimationTrackLike,
      timeSeconds,
    );
    const weightedValue = sampledValue * appliedWeight;
    resolveAnimationBridgeOutputPaths(channel, faceId, rigInputMap).forEach(
      (path) => {
        outputValues.set(path, (outputValues.get(path) ?? 0) + weightedValue);
      },
    );
  });

  return outputValues;
}

export function diffAnimationAggregateValues(
  previousAggregate: Map<string, number>,
  nextAggregate: Map<string, number>,
  epsilon = 1e-6,
): AnimationAggregateOperation[] {
  const operations: AnimationAggregateOperation[] = [];
  const changedPaths = new Set<string>();

  previousAggregate.forEach((previousValue, path) => {
    const nextValue = nextAggregate.get(path);
    if (
      nextValue === undefined ||
      Math.abs(nextValue - previousValue) > epsilon
    ) {
      changedPaths.add(path);
    }
  });

  nextAggregate.forEach((nextValue, path) => {
    const previousValue = previousAggregate.get(path);
    if (
      previousValue === undefined ||
      Math.abs(nextValue - previousValue) > epsilon
    ) {
      changedPaths.add(path);
    }
  });

  changedPaths.forEach((path) => {
    const nextValue = nextAggregate.get(path);
    if (nextValue === undefined) {
      operations.push({ kind: "clear", path });
      return;
    }
    operations.push({ kind: "set", path, value: nextValue });
  });

  return operations;
}
