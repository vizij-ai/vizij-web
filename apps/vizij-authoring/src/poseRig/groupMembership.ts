import type { PoseDefinition, PoseGroupDefinition } from "./types";

export function normalizePoseGroupPath(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

export function sanitizePoseGroupId(
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

export function humanizePoseGroupName(path: string): string {
  const leaf = path.split("/").filter(Boolean).pop() ?? path;
  return leaf
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface PoseGroupLookup {
  byId: Map<string, PoseGroupDefinition>;
  byPath: Map<string, PoseGroupDefinition>;
}

export function buildPoseGroupLookup(
  groups: PoseGroupDefinition[] | undefined,
): PoseGroupLookup {
  const byId = new Map<string, PoseGroupDefinition>();
  const byPath = new Map<string, PoseGroupDefinition>();

  (groups ?? []).forEach((group) => {
    const path = normalizePoseGroupPath(group.path ?? group.name ?? group.id);
    if (!path) {
      return;
    }
    const id = sanitizePoseGroupId(group.id, path);
    const normalized: PoseGroupDefinition = {
      ...group,
      id,
      path,
      name:
        typeof group.name === "string" && group.name.trim().length > 0
          ? group.name.trim()
          : humanizePoseGroupName(path),
    };
    byId.set(id, normalized);
    if (!byPath.has(path)) {
      byPath.set(path, normalized);
    }
  });

  return { byId, byPath };
}

export function resolvePoseMembership(
  pose: Pick<PoseDefinition, "group" | "groupId" | "groupIds">,
  groups: PoseGroupDefinition[] | undefined,
): {
  groupIds: string[];
  primaryGroupId: string | null;
  primaryGroupPath: string | null;
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
    if (path && !pathById.has(groupId)) {
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

  pose.groupIds?.forEach((groupId) => {
    addById(groupId);
  });
  addById(pose.groupId);
  addByPath(pose.group);

  const primaryGroupId = resolvedGroupIds[0] ?? null;
  const primaryGroupPath = primaryGroupId
    ? (byId.get(primaryGroupId)?.path ?? pathById.get(primaryGroupId) ?? null)
    : null;

  return {
    groupIds: resolvedGroupIds,
    primaryGroupId,
    primaryGroupPath,
  };
}
