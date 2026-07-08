import type { ManagedStandardInput } from "../../types/standardInputs";

export type RotationAxis = "x" | "y" | "z";

export interface SceneRotationInput {
  axis: RotationAxis;
  inputId: string;
  defaultValue: number;
  label: string;
  path: string;
}

export type SceneRotationInputMap = Partial<
  Record<RotationAxis, SceneRotationInput>
>;

const AXIS_ORDER: readonly RotationAxis[] = ["x", "y", "z"];

function normalizeAxisToken(
  value: string | null | undefined,
): RotationAxis | null {
  if (!value) {
    return null;
  }
  const lowered = value.trim().toLowerCase();
  if (lowered === "x" || lowered === "y" || lowered === "z") {
    return lowered;
  }
  return null;
}

function normalizeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function toSceneRotationInput(
  axis: RotationAxis,
  entry: ManagedStandardInput,
): SceneRotationInput {
  return {
    axis,
    inputId: entry.input.id,
    defaultValue: normalizeNumber(entry.input.defaultValue),
    label: entry.input.label,
    path: entry.input.path,
  };
}

function assignAxisIfMissing(
  map: SceneRotationInputMap,
  axis: RotationAxis,
  entry: ManagedStandardInput,
) {
  if (map[axis]) {
    return;
  }
  map[axis] = toSceneRotationInput(axis, entry);
}

function resolveSceneAxisFromPath(path: string): RotationAxis | null {
  const normalized = path.trim().toLowerCase();
  const match = normalized.match(/\/scene\/rotation\/([xyz])$/);
  return normalizeAxisToken(match?.[1] ?? null);
}

/**
 * Resolve root-scene rotation inputs used for import-time orientation correction.
 * Prefers auto-input metadata for the current root; falls back to canonical
 * `/scene/rotation/{x|y|z}` paths if metadata is unavailable.
 */
export function resolveRootSceneRotationInputs(
  managedStandardInputs: readonly ManagedStandardInput[],
  rootId: string | null,
): SceneRotationInputMap {
  if (!rootId || managedStandardInputs.length === 0) {
    return {};
  }

  const next: SceneRotationInputMap = {};

  managedStandardInputs.forEach((entry) => {
    if (entry.disabled || entry.source !== "auto" || !entry.metadata) {
      return;
    }
    if (entry.metadata.elementId !== rootId) {
      return;
    }
    if ((entry.metadata.featureKey ?? "").trim().toLowerCase() !== "rotation") {
      return;
    }
    const axis = normalizeAxisToken(entry.metadata.componentKey);
    if (!axis) {
      return;
    }
    assignAxisIfMissing(next, axis, entry);
  });

  if (AXIS_ORDER.every((axis) => next[axis])) {
    return next;
  }

  managedStandardInputs.forEach((entry) => {
    if (entry.disabled || entry.source !== "auto") {
      return;
    }
    const axis = resolveSceneAxisFromPath(entry.input.path);
    if (!axis) {
      return;
    }
    assignAxisIfMissing(next, axis, entry);
  });

  return next;
}

export function radiansToRoundedDegrees(value: number): number {
  const normalized = normalizeNumber(value);
  return Math.round((normalized * 180) / Math.PI);
}
