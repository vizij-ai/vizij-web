import { type RefObject, createRef } from "react";
import { mapValues } from "lodash";
import { createDefaultGroup } from "../functions/create-world-element";
import { World } from "../types/world";
import { VizijData } from "../store-types";
import { Group } from "../types/group";

export function createNewElement(
  state: VizijData,
  type: "group",
  root = false,
) {
  if (type === "group") {
    if (Object.entries(state.world as World).length === 0) {
      const name = `New-Root`;
      const refs = { default: createRef() } as Record<
        string,
        RefObject<SVGGElement>
      >;
      const newElement: Group = createDefaultGroup({ name, root: true, refs });
      state.world[newElement.id] = newElement;
      state.selectedWorldElement = newElement.id;
    } else {
      const worldRoot = Object.entries(state.world as World).filter(
        ([, e]) => e.type === "group" && e.root,
      )[0][1] as Group;
      const name = `New-Body`;
      const refs = mapValues(worldRoot.refs, () => createRef()) as Record<
        string,
        RefObject<SVGGElement>
      >;
      const newChild: Group = createDefaultGroup({ name, root, refs });
      (worldRoot as Group).children.push(newChild.id);
      state.world[newChild.id] = newChild;
      state.selectedWorldElement = newChild.id;
    }
  }
}
