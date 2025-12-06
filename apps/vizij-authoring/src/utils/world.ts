import type { Group, World } from "@vizij/render";

export function findRootId(world: World): string | null {
  const root = Object.values(world).find(
    (entry): entry is Group =>
      entry.type === "group" && Boolean(entry.rootBounds),
  );
  return root ? root.id : null;
}
