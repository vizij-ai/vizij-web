import type { AnimationClipLike } from "../types";

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

export function resolveAnimationBridgeOutputPaths(
  channel: string,
  faceId?: string,
  rigInputMap?: Record<string, string>,
): string[] {
  const normalizedChannel = channel.trim().replace(/^\/+/, "");
  if (!normalizedChannel) {
    return [];
  }

  const outputPaths = new Set<string>([normalizedChannel]);
  if (normalizedChannel.startsWith("animation/")) {
    return Array.from(outputPaths).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  if (rigInputMap && Object.keys(rigInputMap).length > 0) {
    const candidateKeys = new Set<string>([normalizedChannel]);
    const rigChannelMatch = /^rig\/[^/]+\/(.+)$/.exec(normalizedChannel);
    if (rigChannelMatch?.[1]) {
      candidateKeys.add(rigChannelMatch[1]);
    }

    candidateKeys.forEach((key) => {
      const mapped = rigInputMap[key];
      const normalized = mapped?.trim().replace(/^\/+/, "");
      if (normalized) {
        outputPaths.add(normalized);
      }
    });

    const suffix = normalizedChannel.includes("/")
      ? normalizedChannel
      : `/${normalizedChannel}`;
    Object.values(rigInputMap).forEach((mappedPath) => {
      const normalized = mappedPath?.trim().replace(/^\/+/, "");
      if (!normalized) {
        return;
      }
      if (normalized === normalizedChannel || normalized.endsWith(suffix)) {
        outputPaths.add(normalized);
      }
    });
  }

  if (!faceId) {
    return Array.from(outputPaths).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  const rigChannelMatch = /^rig\/[^/]+\/(.+)$/.exec(normalizedChannel);
  if (rigChannelMatch?.[1]) {
    outputPaths.add(`rig/${faceId}/${rigChannelMatch[1]}`);
  } else if (!normalizedChannel.startsWith("rig/")) {
    outputPaths.add(`rig/${faceId}/${normalizedChannel}`);
  }

  return Array.from(outputPaths).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function collectAnimationClipOutputPaths(
  clip: AnimationClipLike,
  faceId?: string,
  rigInputMap?: Record<string, string>,
): string[] {
  const outputPaths = new Set<string>();
  const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];

  tracks.forEach((track) => {
    const channel =
      typeof track.channel === "string" ? track.channel.trim() : "";
    if (!channel) {
      return;
    }
    resolveAnimationBridgeOutputPaths(channel, faceId, rigInputMap).forEach(
      (path) => {
        outputPaths.add(path);
      },
    );
  });

  return Array.from(outputPaths).sort((left, right) =>
    left.localeCompare(right),
  );
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
