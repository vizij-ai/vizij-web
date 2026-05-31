import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, StandardInputId } from "../types/poseRig";

export interface PoseWeightPathInfo {
  segment: string;
  relativePath: string;
  absolutePath: string;
}

export const POSE_CONTROL_INPUT_PATH_PREFIX = "/pose/control/";
export const POSE_WEIGHT_INPUT_PATH_PREFIX = "/poses/";

export function createNeutralInputs(
  inputs: StandardRigInput[] = [],
): Record<StandardInputId, number> {
  const values: Record<StandardInputId, number> = {};
  inputs.forEach((input) => {
    values[input.id] = input.defaultValue ?? 0;
  });
  return values;
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

export function buildPoseControlRelativePath(
  inputId: string | null | undefined,
): string {
  const trimmed = inputId?.trim() ?? "";
  return `${POSE_CONTROL_INPUT_PATH_PREFIX}${trimmed || "input"}`;
}

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

function buildGeneratedPoseIdBase(name: string | null | undefined): string {
  const nameSegment = sanitizePosePathSegment(name, "pose");
  const normalizedBase = nameSegment || "pose";
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
