import type { Group, World } from "@vizij/render";

export type RootResolutionStrategy = "metadata" | "derived";

export type WorldRootResolution =
  | {
      status: "resolved";
      rootId: string;
      strategy: RootResolutionStrategy;
    }
  | {
      status: "blocked_recoverable";
      message: string;
    };

function listGroups(world: World): Group[] {
  return Object.values(world).filter(
    (entry): entry is Group => entry.type === "group",
  );
}

function findMetadataRoot(groups: Group[]): Group | null {
  const match = groups.find((entry) => Boolean(entry.rootBounds));
  return match ?? null;
}

function findDerivedRoot(groups: Group[]): Group | null {
  const explicitRoot = groups.find((entry) => entry.root);
  if (explicitRoot) {
    return explicitRoot;
  }
  if (groups.length === 1) {
    return groups[0] ?? null;
  }
  return null;
}

export function resolveWorldRoot(world: World): WorldRootResolution {
  const groups = listGroups(world);
  if (groups.length === 0) {
    return {
      status: "blocked_recoverable",
      message:
        "Unable to resolve a Vizij root: no group entries were found in the imported world.",
    };
  }

  const metadataRoot = findMetadataRoot(groups);
  if (metadataRoot) {
    return {
      status: "resolved",
      rootId: metadataRoot.id,
      strategy: "metadata",
    };
  }

  const derivedRoot = findDerivedRoot(groups);
  if (derivedRoot) {
    return {
      status: "resolved",
      rootId: derivedRoot.id,
      strategy: "derived",
    };
  }

  return {
    status: "blocked_recoverable",
    message:
      "Unable to resolve a Vizij root from metadata or derived bounds. Load an asset with a single root group or explicit root bounds metadata.",
  };
}

export function findRootId(world: World): string | null {
  const resolved = resolveWorldRoot(world);
  return resolved.status === "resolved" ? resolved.rootId : null;
}
