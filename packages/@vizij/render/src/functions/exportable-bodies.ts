type GroupLike = {
  id: string;
  type: string;
  parent?: string | null;
  root?: boolean;
  rootBounds?: unknown;
};

type WorldLike = Record<string, GroupLike>;

function asGroupEntries(world: WorldLike): GroupLike[] {
  return Object.values(world).filter((entry) => entry.type === "group");
}

export function selectExportableGroupEntries(
  world: WorldLike,
  filterIds?: string[],
): GroupLike[] {
  const groupEntries = asGroupEntries(world);
  const filterSet =
    Array.isArray(filterIds) && filterIds.length > 0
      ? new Set(filterIds)
      : null;

  if (filterSet) {
    return groupEntries.filter((entry) => filterSet.has(entry.id));
  }

  const rootBoundsGroups = groupEntries.filter((entry) =>
    Boolean(entry.rootBounds),
  );
  if (rootBoundsGroups.length > 0) {
    return rootBoundsGroups;
  }

  const explicitRootGroups = groupEntries.filter(
    (entry) => entry.root === true,
  );
  if (explicitRootGroups.length > 0) {
    return explicitRootGroups;
  }

  const topLevelGroups = groupEntries.filter((entry) => !entry.parent);
  if (topLevelGroups.length > 0) {
    return topLevelGroups;
  }

  return groupEntries;
}
