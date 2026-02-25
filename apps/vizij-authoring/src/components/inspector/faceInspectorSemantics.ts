import type { StandardRigInput } from "@vizij/utils";

export type FaceInspectorCurrentValueSourceKind =
  | "propsrig-channel"
  | "standard-input-channel"
  | "unresolved-channel"
  | "blocked-channel"
  | "static-channel";

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

function coerceFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

export function resolveFaceInspectorCurrentValue({
  inputId,
  standardInput,
  unresolvedInputId,
  blockedReason,
  inputValues,
  staticValue,
}: ResolveFaceInspectorCurrentValueArgs): FaceInspectorCurrentValueResolution {
  const fallback = coerceFiniteNumber(staticValue, 0);

  if (blockedReason) {
    return {
      currentValue: fallback,
      sourceLabel: `Blocked channel (${blockedReason})`,
      sourceKind: "blocked-channel",
    };
  }

  if (inputId && standardInput) {
    const staged = inputValues[inputId];
    const defaultValue = coerceFiniteNumber(
      standardInput.defaultValue,
      fallback,
    );
    const sourceLabel = standardInput.path || standardInput.id;
    return {
      currentValue: coerceFiniteNumber(staged, defaultValue),
      sourceLabel,
      sourceKind: sourceLabel.startsWith("/propsrig/")
        ? "propsrig-channel"
        : "standard-input-channel",
    };
  }

  const unresolved = unresolvedInputId ?? inputId;
  if (unresolved) {
    return {
      currentValue: fallback,
      sourceLabel: `Unresolved channel (${unresolved})`,
      sourceKind: "unresolved-channel",
    };
  }

  return {
    currentValue: fallback,
    sourceLabel: "Static channel value",
    sourceKind: "static-channel",
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
