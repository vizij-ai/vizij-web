import type { StandardRigInput } from "@vizij/utils";

export type FaceInspectorCurrentValueSourceKind =
  | "propsrig-channel"
  | "standard-input-channel"
  | "unresolved-channel"
  | "blocked-channel"
  | "static-channel";

export interface FaceInspectorCurrentValueResolution {
  currentValue: number;
  sourceKind: FaceInspectorCurrentValueSourceKind;
  sourceInputId: string | null;
  sourcePath: string | null;
  unresolvedInputId: string | null;
  blockedReason: string | null;
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
      sourceKind: "blocked-channel",
      sourceInputId: null,
      sourcePath: null,
      unresolvedInputId: null,
      blockedReason,
    };
  }

  if (inputId && standardInput) {
    const staged = inputValues[inputId];
    const defaultValue = coerceFiniteNumber(
      standardInput.defaultValue,
      fallback,
    );
    const sourcePath = standardInput.path || "";
    return {
      currentValue: coerceFiniteNumber(staged, defaultValue),
      sourceKind: sourcePath.startsWith("/propsrig/")
        ? "propsrig-channel"
        : "standard-input-channel",
      sourceInputId: standardInput.id,
      sourcePath,
      unresolvedInputId: null,
      blockedReason: null,
    };
  }

  const unresolved = unresolvedInputId ?? inputId;
  if (unresolved) {
    return {
      currentValue: fallback,
      sourceKind: "unresolved-channel",
      sourceInputId: null,
      sourcePath: null,
      unresolvedInputId: unresolved,
      blockedReason: null,
    };
  }

  return {
    currentValue: fallback,
    sourceKind: "static-channel",
    sourceInputId: null,
    sourcePath: null,
    unresolvedInputId: null,
    blockedReason: null,
  };
}
