import type { PoseGroupDefinition } from "@vizij/studio-support";

export const POSE_WEIGHT_INPUT_PATH_PREFIX = "/poses/";

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

// --- Pose group membership resolution ---

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
    if (leftIndex !== undefined) return -1;
    if (rightIndex !== undefined) return 1;
    const leftPath = normalizePoseGroupPath(left) ?? left;
    const rightPath = normalizePoseGroupPath(right) ?? right;
    const byPath = leftPath.localeCompare(rightPath);
    if (byPath !== 0) return byPath;
    return left.localeCompare(right);
  });

  return unique;
}

export function resolvePoseMembership(
  pose: { group?: string | null; groupId?: string | null; groupIds?: string[] },
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
    if (!groupId) return;
    if (!resolvedGroupIds.includes(groupId)) {
      resolvedGroupIds.push(groupId);
    }
    if (path) {
      const existingPath = pathById.get(groupId);
      const normalizedGroupIdPath = normalizePoseGroupPath(groupId);
      const normalizedExistingPath =
        normalizePoseGroupPath(existingPath) ?? existingPath ?? null;
      const normalizedIncomingPath =
        normalizePoseGroupPath(path) ?? path ?? null;
      const shouldPromotePath =
        normalizedExistingPath === null ||
        (normalizedGroupIdPath !== null &&
          normalizedExistingPath === normalizedGroupIdPath &&
          normalizedIncomingPath !== normalizedGroupIdPath);
      if (shouldPromotePath) {
        pathById.set(groupId, path);
      }
    }
  };

  const addByPath = (rawPath: string | null | undefined) => {
    const normalizedPath = normalizePoseGroupPath(rawPath);
    if (!normalizedPath) return;
    const existing = byPath.get(normalizedPath);
    if (existing) {
      addMembership(existing.id, existing.path);
      return;
    }
    addMembership(sanitizePoseGroupId(null, normalizedPath), normalizedPath);
  };

  const addById = (rawId: string | null | undefined) => {
    const trimmed = rawId?.trim() ?? "";
    if (!trimmed) return;
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
    if (!path) return;
    groupPathsById[groupId] = path;
  });

  return {
    groupIds: orderedGroupIds,
    primaryGroupId,
    primaryGroupPath,
    groupPathsById,
  };
}
