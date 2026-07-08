import type { PoseDefinition, PoseGroupDefinition } from "../types";

export const POSE_WEIGHT_INPUT_PATH_PREFIX = "/poses/";
export const VISEME_POSE_KEYS = [
  "a",
  "at",
  "b",
  "e",
  "e_2",
  "f",
  "i",
  "k",
  "m",
  "o",
  "o_2",
  "p",
  "r",
  "s",
  "t",
  "t_2",
  "u",
] as const;
export const EXPRESSIVE_EMOTION_POSE_KEYS = [
  "concerned",
  "happy",
  "sad",
  "sleepy",
  "surprise",
] as const;
export const EMOTION_POSE_KEYS = [
  "concerned",
  "happy",
  "neutral",
  "sad",
  "sleepy",
  "surprise",
  "angry",
] as const;

export type PoseSemanticKind = "emotion" | "viseme" | "other";

const VISEME_GROUP_NEEDLES = ["viseme", "phoneme", "lip", "mouth"];
const EMOTION_GROUP_NEEDLES = ["emotion", "expression", "mood", "affect"];
const VISEME_POSE_KEY_SET = new Set<string>(VISEME_POSE_KEYS);
const EMOTION_POSE_KEY_SET = new Set<string>(EMOTION_POSE_KEYS);
const POSE_KEY_ALIASES: Record<string, string> = {
  concern: "concerned",
  surprised: "surprise",
};

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

export function buildPoseWeightPathMap(
  poses: PoseDefinition[],
  faceId: string | null | undefined,
): Map<string, string> {
  const faceSegment = faceId?.trim() || "face";
  const map = new Map<string, string>();

  poses.forEach((pose) => {
    map.set(
      pose.id,
      buildRigInputPath(faceSegment, buildPoseWeightRelativePath(pose.id)),
    );
  });

  return map;
}

export function normalizePoseSemanticKey(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!normalized) {
    return null;
  }
  return POSE_KEY_ALIASES[normalized] ?? normalized;
}

function derivePoseSemanticKeyFromId(
  poseId: string | null | undefined,
): string | null {
  const trimmed = poseId?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const stripped = trimmed
    .replace(/^pose_d_/i, "")
    .replace(/^pose_/i, "")
    .replace(/^d_/i, "")
    .replace(/_d$/i, "");
  return normalizePoseSemanticKey(stripped);
}

export function getPoseSemanticKey(
  pose: Pick<PoseDefinition, "id" | "name">,
): string | null {
  return (
    normalizePoseSemanticKey(pose.name) ??
    derivePoseSemanticKeyFromId(pose.id) ??
    null
  );
}

function normalizePoseGroupPath(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function sanitizePoseGroupId(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalized = (value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_/-]+/g, "_")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "_");
  if (!normalized) {
    return fallback.replace(/\//g, "_");
  }
  return normalized;
}

interface PoseGroupLookup {
  byId: Map<string, PoseGroupDefinition>;
  byPath: Map<string, PoseGroupDefinition>;
  orderById: Map<string, number>;
}

function buildPoseGroupLookup(
  groups: PoseGroupDefinition[] | undefined,
): PoseGroupLookup {
  const byId = new Map<string, PoseGroupDefinition>();
  const byPath = new Map<string, PoseGroupDefinition>();
  const orderById = new Map<string, number>();

  (groups ?? []).forEach((group, index) => {
    const path = normalizePoseGroupPath(group.path ?? group.name ?? group.id);
    if (!path) {
      return;
    }

    const id = sanitizePoseGroupId(group.id, path);
    const humanizedName =
      typeof group.name === "string" && group.name.trim().length > 0
        ? group.name.trim()
        : (path
            .split("/")
            .filter(Boolean)
            .pop()
            ?.split(/[_-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ") ?? path);

    const normalized: PoseGroupDefinition = {
      ...group,
      id,
      path,
      name: humanizedName,
    };
    byId.set(id, normalized);
    if (!orderById.has(id)) {
      orderById.set(id, index);
    }
    if (!byPath.has(path)) {
      byPath.set(path, normalized);
    }
  });

  return { byId, byPath, orderById };
}

function orderPoseMembershipIds(
  groupIds: Iterable<string>,
  groups: PoseGroupDefinition[] | undefined,
): string[] {
  const { orderById } = buildPoseGroupLookup(groups);
  const unique = Array.from(
    new Set(
      Array.from(groupIds)
        .map((groupId) => groupId.trim())
        .filter((groupId) => groupId.length > 0),
    ),
  );

  unique.sort((left, right) => {
    const leftIndex = orderById.get(left);
    const rightIndex = orderById.get(right);
    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }
    if (leftIndex !== undefined) {
      return -1;
    }
    if (rightIndex !== undefined) {
      return 1;
    }
    const leftPath = normalizePoseGroupPath(left) ?? left;
    const rightPath = normalizePoseGroupPath(right) ?? right;
    const byPath = leftPath.localeCompare(rightPath);
    if (byPath !== 0) {
      return byPath;
    }
    return left.localeCompare(right);
  });

  return unique;
}

function valueHasNeedle(
  value: string | null | undefined,
  needles: readonly string[],
): boolean {
  const normalized = normalizePoseSemanticKey(value);
  if (!normalized) {
    return false;
  }
  return needles.some((needle) => normalized.includes(needle));
}

export function resolvePoseMembership(
  pose: Pick<PoseDefinition, "group" | "groupId" | "groupIds">,
  groups: PoseGroupDefinition[] | undefined,
): {
  groupIds: string[];
  primaryGroupId: string | null;
  primaryGroupPath: string | null;
  groupPathsById: Record<string, string>;
} {
  const { byId, byPath } = buildPoseGroupLookup(groups);
  const resolvedGroupIds: string[] = [];
  const pathById = new Map<string, string>();

  const addMembership = (groupId: string | null, path: string | null) => {
    if (!groupId) {
      return;
    }
    if (!resolvedGroupIds.includes(groupId)) {
      resolvedGroupIds.push(groupId);
    }
    if (!path) {
      return;
    }

    const existingPath = pathById.get(groupId);
    const normalizedGroupIdPath = normalizePoseGroupPath(groupId);
    const normalizedExistingPath =
      normalizePoseGroupPath(existingPath) ?? existingPath ?? null;
    const normalizedIncomingPath = normalizePoseGroupPath(path) ?? path ?? null;
    const shouldPromotePath =
      normalizedExistingPath === null ||
      (normalizedGroupIdPath !== null &&
        normalizedExistingPath === normalizedGroupIdPath &&
        normalizedIncomingPath !== normalizedGroupIdPath);
    if (shouldPromotePath) {
      pathById.set(groupId, path);
    }
  };

  const addByPath = (rawPath: string | null | undefined) => {
    const normalizedPath = normalizePoseGroupPath(rawPath);
    if (!normalizedPath) {
      return;
    }
    const existing = byPath.get(normalizedPath);
    if (existing) {
      addMembership(existing.id, existing.path);
      return;
    }
    addMembership(sanitizePoseGroupId(null, normalizedPath), normalizedPath);
  };

  const addById = (rawId: string | null | undefined) => {
    const trimmed = rawId?.trim() ?? "";
    if (!trimmed) {
      return;
    }

    const normalizedPath = normalizePoseGroupPath(trimmed);
    const normalizedId = sanitizePoseGroupId(trimmed, trimmed);

    const matchedById = byId.get(trimmed) ?? byId.get(normalizedId);
    if (matchedById) {
      addMembership(matchedById.id, matchedById.path);
      return;
    }
    if (normalizedPath) {
      const matchedByPath = byPath.get(normalizedPath);
      if (matchedByPath) {
        addMembership(matchedByPath.id, matchedByPath.path);
        return;
      }
    }
    addMembership(
      normalizedId,
      normalizedPath && normalizedPath.length > 0 ? normalizedPath : null,
    );
  };

  pose.groupIds?.forEach((groupId) => addById(groupId));
  addById(pose.groupId);
  addByPath(pose.group);

  const orderedGroupIds = orderPoseMembershipIds(resolvedGroupIds, groups);
  const primaryGroupId = orderedGroupIds[0] ?? null;
  const primaryGroupPath = primaryGroupId
    ? (byId.get(primaryGroupId)?.path ?? pathById.get(primaryGroupId) ?? null)
    : null;
  const groupPathsById: Record<string, string> = {};

  orderedGroupIds.forEach((groupId) => {
    const path = byId.get(groupId)?.path ?? pathById.get(groupId) ?? null;
    if (path) {
      groupPathsById[groupId] = path;
    }
  });

  return {
    groupIds: orderedGroupIds,
    primaryGroupId,
    primaryGroupPath,
    groupPathsById,
  };
}

function poseMatchesGroupKind(
  pose: Pick<PoseDefinition, "group" | "groupId" | "groupIds">,
  groups: PoseGroupDefinition[] | undefined,
  needles: readonly string[],
): boolean {
  const membership = resolvePoseMembership(pose, groups);
  if (
    valueHasNeedle(pose.group, needles) ||
    valueHasNeedle(pose.groupId, needles)
  ) {
    return true;
  }
  if (pose.groupIds?.some((groupId) => valueHasNeedle(groupId, needles))) {
    return true;
  }
  return membership.groupIds.some((groupId) => {
    const path = membership.groupPathsById[groupId] ?? null;
    const group = (groups ?? []).find((entry) => entry.id === groupId) ?? null;
    return (
      valueHasNeedle(groupId, needles) ||
      valueHasNeedle(path, needles) ||
      valueHasNeedle(group?.name, needles)
    );
  });
}

export function resolvePoseSemantics(
  pose: Pick<PoseDefinition, "id" | "name" | "group" | "groupId" | "groupIds">,
  groups: PoseGroupDefinition[] | undefined,
): {
  key: string | null;
  kind: PoseSemanticKind;
  membership: ReturnType<typeof resolvePoseMembership>;
} {
  const membership = resolvePoseMembership(pose, groups);
  const key = getPoseSemanticKey(pose);
  const looksLikeVisemeGroup = poseMatchesGroupKind(
    pose,
    groups,
    VISEME_GROUP_NEEDLES,
  );
  const looksLikeEmotionGroup = poseMatchesGroupKind(
    pose,
    groups,
    EMOTION_GROUP_NEEDLES,
  );

  let kind: PoseSemanticKind = "other";
  if (looksLikeVisemeGroup || (key && VISEME_POSE_KEY_SET.has(key))) {
    kind = "viseme";
  } else if (looksLikeEmotionGroup || (key && EMOTION_POSE_KEY_SET.has(key))) {
    kind = "emotion";
  }

  return { key, kind, membership };
}

export function filterPosesBySemanticKind(
  poses: PoseDefinition[],
  groups: PoseGroupDefinition[] | undefined,
  kind: PoseSemanticKind,
): PoseDefinition[] {
  return poses.filter(
    (pose) => resolvePoseSemantics(pose, groups).kind === kind,
  );
}

export function buildSemanticPoseWeightPathMap(
  poses: PoseDefinition[],
  groups: PoseGroupDefinition[] | undefined,
  faceId: string | null | undefined,
  kind: Exclude<PoseSemanticKind, "other">,
): Map<string, string> {
  const map = new Map<string, string>();
  const pathMap = buildPoseWeightPathMap(poses, faceId);
  poses.forEach((pose) => {
    const semantics = resolvePoseSemantics(pose, groups);
    const path = pathMap.get(pose.id);
    if (
      semantics.kind !== kind ||
      !semantics.key ||
      !path ||
      map.has(semantics.key)
    ) {
      return;
    }
    map.set(semantics.key, path);
  });
  return map;
}
