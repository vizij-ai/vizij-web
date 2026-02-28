import { useMemo } from "react";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import type {
  LowLevelBinding,
  LowLevelRigSummary,
  PoseDefinition,
  StandardInputId,
} from "./types";

export function createNeutralInputs(
  inputs: StandardRigInput[] = [],
): Record<StandardInputId, number> {
  const values: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    values[input.id] = input.defaultValue ?? 0;
  });
  return values;
}

export function ensureNeutralDefaults(
  current: Record<StandardInputId, number>,
  inputs: StandardRigInput[],
): Record<StandardInputId, number> {
  const next = { ...current };
  let changed = false;
  inputs.forEach((input) => {
    if (next[input.id] === undefined) {
      next[input.id] = input.defaultValue ?? 0;
      changed = true;
    }
  });
  return changed ? next : current;
}

export function buildRigInputPath(faceId: string, path: string): string {
  let trimmed = path.startsWith("/") ? path.slice(1) : path;
  if (!trimmed) {
    return `rig/${faceId}`;
  }
  while (trimmed.startsWith("rig/")) {
    const segments = trimmed.split("/");
    if (segments.length >= 3) {
      const existingFaceId = segments[1];
      const remainder = segments.slice(2).join("/");
      if (existingFaceId === faceId) {
        return trimmed;
      }
      trimmed = remainder || "";
    } else {
      trimmed = segments.slice(1).join("/");
    }
  }
  const suffix = trimmed ? `/${trimmed}` : "";
  return `rig/${faceId}${suffix}`;
}

export function buildBindingsByInput(
  summary: LowLevelRigSummary | null | undefined,
): Map<StandardInputId, LowLevelBinding[]> {
  const map = new Map<StandardInputId, LowLevelBinding[]>();
  if (!summary) {
    return map;
  }
  summary.bindings.forEach((binding) => {
    if (!binding.inputId) {
      return;
    }
    const list = map.get(binding.inputId) ?? [];
    list.push(binding);
    map.set(binding.inputId, list);
  });
  return map;
}

export function collectBindingIssues(
  summary: LowLevelRigSummary | null | undefined,
  animatables: Record<string, AnimatableValue>,
  components: AnimatableComponent[],
): string[] {
  if (!summary) {
    return [];
  }

  const issues: string[] = [];
  const componentLookup = new Set(components.map((component) => component.id));

  summary.bindings.forEach((binding) => {
    if (!binding.inputId) {
      return;
    }
    if (!animatables[binding.animatableId]) {
      issues.push(
        `Animatable ${binding.animatableId} missing for binding ${binding.inputId}`,
      );
    }
    if (!componentLookup.has(binding.targetId)) {
      issues.push(`Component ${binding.targetId} missing for binding.`);
    }
  });

  return issues;
}

export function useMemoizedBindingsByInput(summary: LowLevelRigSummary | null) {
  return useMemo(() => buildBindingsByInput(summary), [summary]);
}

export function capturePoseSnapshot(options: {
  inputs: StandardRigInput[];
  currentValues: Record<StandardInputId, number>;
}): Record<StandardInputId, number> {
  const { inputs, currentValues } = options;
  const snapshot: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    const value = currentValues[input.id] ?? 0;
    snapshot[input.id] = value;
  });
  return snapshot;
}

const POSE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function appendStableSuffix(
  baseId: string,
  usedIds: Set<string>,
  startAt = 2,
): string {
  let suffix = startAt;
  let candidate = `${baseId}_${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }
  return candidate;
}

function buildGeneratedPoseIdBase(name: string | null | undefined): string {
  const nameSegment = sanitizePosePathSegment(name, "pose");
  const rawBase = [nameSegment].filter(Boolean).join("_");
  const normalizedBase = rawBase || "pose";
  return normalizedBase.startsWith("pose_")
    ? normalizedBase
    : `pose_${normalizedBase}`;
}

export function isValidPoseId(
  value: string | null | undefined,
): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value) {
    return false;
  }
  return POSE_ID_PATTERN.test(trimmed);
}

export function resolveDeterministicPoseId(options: {
  existingIds?: Iterable<string>;
  preferredId?: string | null;
  name?: string | null;
  group?: string | null;
  reservedIds?: Iterable<string>;
}): string {
  const usedIds = new Set(options.existingIds ?? []);
  if (options.reservedIds) {
    for (const reserved of options.reservedIds) {
      usedIds.add(reserved);
    }
  }

  const preferredId = options.preferredId?.trim() ?? "";
  const baseId = isValidPoseId(preferredId)
    ? preferredId
    : buildGeneratedPoseIdBase(options.name);

  if (!usedIds.has(baseId)) {
    return baseId;
  }

  return appendStableSuffix(baseId, usedIds);
}

export function normalizePoseDefinitionIds(
  poses: PoseDefinition[],
  options?: { reservedIds?: Iterable<string> },
): PoseDefinition[] {
  const usedIds = new Set<string>();
  const normalized: PoseDefinition[] = [];
  poses.forEach((pose) => {
    const nextId = resolveDeterministicPoseId({
      existingIds: usedIds,
      preferredId: pose.id,
      name: pose.name,
      group: pose.group,
      reservedIds: options?.reservedIds,
    });
    usedIds.add(nextId);
    if (nextId === pose.id) {
      normalized.push(pose);
      return;
    }
    normalized.push({ ...pose, id: nextId });
  });
  return normalized;
}

export function duplicatePoseDefinition(
  pose: PoseDefinition,
  options?: {
    existingIds?: Iterable<string>;
    reservedIds?: Iterable<string>;
  },
): PoseDefinition {
  const now = new Date().toISOString();
  const name = `${pose.name} Copy`;
  const id = resolveDeterministicPoseId({
    existingIds: options?.existingIds,
    name,
    group: pose.group,
    reservedIds: options?.reservedIds,
  });
  return {
    ...pose,
    id,
    name,
    values: { ...pose.values },
    createdAt: now,
    updatedAt: now,
  };
}

export function slugifyLabel(
  value: string | null | undefined,
  fallback: string,
): string {
  return sanitizePosePathSegment(value, fallback);
}

export function sanitizePosePathSegment(
  value: string | null | undefined,
  fallback: string,
): string {
  const fromLabel = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (fromLabel) {
    return fromLabel;
  }
  const fromFallback = fallback
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return fromFallback || "pose";
}

export interface PoseWeightPathInfo {
  segment: string;
  relativePath: string;
  absolutePath: string;
}

export const POSE_WEIGHT_INPUT_PATH_PREFIX = "/poses/";
export const POSE_WEIGHT_INPUT_SOURCE_PREFIX = "pose-weight:";
export const POSE_CONTROL_INPUT_PATH_PREFIX = "/pose/control/";
export const POSE_GROUP_OUTPUT_PATH_PREFIX = "/pose/groups/";
export const POSE_STAGE_OUTPUT_PATH_PREFIX = "/pose/stages/";

function normalizePoseWeightPathSegment(
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "pose";
  }
  const normalized = trimmed
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "pose";
}

export function buildPoseWeightInputPathSegment(
  poseId: string | null | undefined,
): string {
  return normalizePoseWeightPathSegment(poseId);
}

export function buildPoseWeightRelativePath(
  poseId: string | null | undefined,
): string {
  return `${POSE_WEIGHT_INPUT_PATH_PREFIX}${buildPoseWeightInputPathSegment(
    poseId,
  )}.weight`;
}

export function buildPoseWeightInputSourceId(
  poseId: string | null | undefined,
): string {
  return `${POSE_WEIGHT_INPUT_SOURCE_PREFIX}${poseId?.trim() ?? ""}`;
}

export function buildPoseControlRelativePath(
  inputId: string | null | undefined,
): string {
  const trimmed = inputId?.trim() ?? "";
  return `${POSE_CONTROL_INPUT_PATH_PREFIX}${trimmed || "input"}`;
}

export function isPoseControlInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path);
  return normalized.startsWith(POSE_CONTROL_INPUT_PATH_PREFIX);
}

export function isPoseOutputInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path);
  const isGroupOutput =
    normalized.startsWith(POSE_GROUP_OUTPUT_PATH_PREFIX) &&
    normalized.endsWith(".output");
  if (isGroupOutput) {
    return true;
  }
  return (
    normalized.startsWith(POSE_STAGE_OUTPUT_PATH_PREFIX) &&
    normalized.endsWith(".output")
  );
}

export function parsePoseControlInputIdFromPath(
  path: string | null | undefined,
): string | null {
  if (!path) {
    return null;
  }
  const normalized = normalizeStandardRigInputPath(path);
  if (!normalized.startsWith(POSE_CONTROL_INPUT_PATH_PREFIX)) {
    return null;
  }
  const inputId = normalized
    .slice(POSE_CONTROL_INPUT_PATH_PREFIX.length)
    .replace(/^\/+/g, "");
  return inputId.length > 0 ? inputId : null;
}

export function parsePoseWeightInputSourceId(
  sourceId: string | null | undefined,
): string | null {
  const trimmed = sourceId?.trim() ?? "";
  if (!trimmed.startsWith(POSE_WEIGHT_INPUT_SOURCE_PREFIX)) {
    return null;
  }
  const poseId = trimmed.slice(POSE_WEIGHT_INPUT_SOURCE_PREFIX.length).trim();
  return poseId.length > 0 ? poseId : null;
}

export function isPoseWeightInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path);
  return (
    normalized.startsWith(POSE_WEIGHT_INPUT_PATH_PREFIX) &&
    normalized.endsWith(".weight")
  );
}

export function buildPoseWeightPathMap(
  poses: PoseDefinition[],
  faceId: string | null,
): Map<string, PoseWeightPathInfo> {
  const trim = faceId?.trim();
  const faceSegment = trim && trim.length > 0 ? trim : "face";
  const usage = new Map<string, number>();
  const map = new Map<string, PoseWeightPathInfo>();
  poses.forEach((pose) => {
    const baseSegment = buildPoseWeightInputPathSegment(pose.id);
    const used = usage.get(baseSegment) ?? 0;
    usage.set(baseSegment, used + 1);
    const segment = used === 0 ? baseSegment : `${baseSegment}_${used + 1}`;
    const relativePath = `${POSE_WEIGHT_INPUT_PATH_PREFIX}${segment}.weight`;
    const absolutePath = buildRigInputPath(faceSegment, relativePath);
    map.set(pose.id, { segment, relativePath, absolutePath });
  });
  return map;
}
