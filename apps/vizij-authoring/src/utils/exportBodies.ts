export type ExportableWorldGroup = {
  id: string;
  type: string;
  parent?: string | null;
  root?: boolean;
  rootBounds?: unknown;
  refs?: Record<string, { current?: unknown }>;
};

export function resolveExportBodiesFromWorld(
  world: Record<string, unknown>,
  filterIds?: string[],
): unknown[] {
  const groups = Object.values(world).filter(
    (entry): entry is ExportableWorldGroup =>
      Boolean(entry) &&
      typeof entry === "object" &&
      (entry as ExportableWorldGroup).type === "group",
  );
  const filterSet =
    Array.isArray(filterIds) && filterIds.length > 0
      ? new Set(filterIds)
      : null;

  const candidates = filterSet
    ? groups.filter((entry) => filterSet.has(entry.id))
    : (() => {
        const rootBoundsGroups = groups.filter((entry) =>
          Boolean(entry.rootBounds),
        );
        if (rootBoundsGroups.length > 0) {
          return rootBoundsGroups;
        }
        const explicitRootGroups = groups.filter(
          (entry) => entry.root === true,
        );
        if (explicitRootGroups.length > 0) {
          return explicitRootGroups;
        }
        const topLevelGroups = groups.filter((entry) => !entry.parent);
        if (topLevelGroups.length > 0) {
          return topLevelGroups;
        }
        return groups;
      })();

  return candidates.flatMap((entry) => {
    const refs = Object.values(entry.refs ?? {});
    const resolved = refs.find((ref) => ref?.current)?.current ?? null;
    return resolved ? [resolved] : [];
  });
}
