import { createDefaultGroup } from "../functions/create-world-element";
import type { World } from "../types/world";
import type { VizijData } from "../store-types";
import type { Group as RenderGroup } from "../types/group";
import type { Selection } from "../types/selection";

export function createNewElement(
  state: VizijData,
  type: "group",
  root = false,
) {
  if (type === "group") {
    const buildSelection = (id: string): Selection => ({
      id,
      namespace: "world",
      type: "group",
    });

    if (Object.entries(state.world as World).length === 0) {
      const name = `New-Root`;
      const newElement: RenderGroup = createDefaultGroup({
        name,
        root: true,
      });
      state.world[newElement.id] = newElement;
      state.elementSelection = [buildSelection(newElement.id)];
    } else {
      const worldRootEntry = Object.values(state.world as World).find(
        (entry): entry is RenderGroup => entry.type === "group" && entry.root,
      );
      if (!worldRootEntry) {
        return;
      }
      const name = `New-Body`;
      const newChild: RenderGroup = createDefaultGroup({ name, root });
      worldRootEntry.children.push(newChild.id);
      state.world[newChild.id] = newChild;
      state.elementSelection = [buildSelection(newChild.id)];
    }
  }
}
