import {
  formatStandardRigInputDisplayPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  resolveFaceInspectorCurrentValue as resolveFaceInspectorCurrentValueCore,
  type FaceInspectorCurrentValueSourceKind,
} from "@vizij/studio-support";

export type { FaceInspectorCurrentValueSourceKind };

export interface FaceInspectorCurrentValueResolution {
  currentValue: number;
  sourceLabel: string;
  sourceKind: FaceInspectorCurrentValueSourceKind;
}

interface ResolveFaceInspectorCurrentValueArgs {
  inputId: string | null;
  standardInput: StandardRigInput | null;
  unresolvedInputId: string | null;
  blockedReason: string | null;
  inputValues: Record<string, number>;
  staticValue: number;
}

function formatSourceLabel(
  resolved: ReturnType<typeof resolveFaceInspectorCurrentValueCore>,
): string {
  if (resolved.sourceKind === "blocked-channel") {
    return `Blocked channel (${resolved.blockedReason ?? "blocked"})`;
  }
  if (resolved.sourceKind === "unresolved-channel") {
    return `Unresolved channel (${resolved.unresolvedInputId ?? "unknown"})`;
  }
  if (resolved.sourcePath) {
    return formatStandardRigInputDisplayPath(resolved.sourcePath);
  }
  if (resolved.sourceInputId) {
    return resolved.sourceInputId;
  }
  return "Static channel value";
}

export function resolveFaceInspectorCurrentValue(
  args: ResolveFaceInspectorCurrentValueArgs,
): FaceInspectorCurrentValueResolution {
  const resolved = resolveFaceInspectorCurrentValueCore(args);
  return {
    currentValue: resolved.currentValue,
    sourceKind: resolved.sourceKind,
    sourceLabel: formatSourceLabel(resolved),
  };
}

export function toggleInspectorChannelLock(
  current: ReadonlySet<string>,
  channelId: string,
): Set<string> {
  const next = new Set(current);
  if (next.has(channelId)) {
    next.delete(channelId);
  } else {
    next.add(channelId);
  }
  return next;
}

export function isInspectorChannelLocked(
  lockedChannels: ReadonlySet<string>,
  channelId: string,
): boolean {
  return lockedChannels.has(channelId);
}
