import type { VizijData } from "../store-types";
import type { World } from "../types/world";

export function removeFromTree(
  state: VizijData,
  nodesToRemove: string[], // Body id that is being set as child
) {
  Object.entries(state.world as World).forEach(([, element]) => {
    if (element.type === "group") {
      element.children = element.children.filter(
        (c: string) => !nodesToRemove.includes(c),
      );
      state.world[element.id] = element;
    }
  });
}
