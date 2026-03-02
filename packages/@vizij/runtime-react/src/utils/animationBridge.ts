export function resolveAnimationBridgeOutputPaths(
  channel: string,
  faceId?: string,
): string[] {
  const outputPaths = new Set<string>([channel]);
  if (!faceId || channel.startsWith("animation/")) {
    return Array.from(outputPaths).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  const rigChannelMatch = /^rig\/[^/]+\/(.+)$/.exec(channel);
  if (rigChannelMatch?.[1]) {
    outputPaths.add(`rig/${faceId}/${rigChannelMatch[1]}`);
  } else if (!channel.startsWith("rig/")) {
    outputPaths.add(`rig/${faceId}/${channel}`);
  }

  return Array.from(outputPaths).sort((left, right) =>
    left.localeCompare(right),
  );
}
