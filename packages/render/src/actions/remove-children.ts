import { VizijData } from "../store-types";
import { World } from "../types/world";

export function removeFromTree(
  state: VizijData,
  nodesToRemove: string[], // Body id that is being set as child
) {
  Object.entries(state.world as World).forEach(([, element]) => {
    if ("children" in element) {
      // element is a body
      // Remove child from children of all other parents
      element.children = element.children.filter((c: string) => !nodesToRemove.includes(c));
      state.world[element.id] = element;
    }
  });
}
