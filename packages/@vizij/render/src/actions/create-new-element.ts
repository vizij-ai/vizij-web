import { createRef } from "react";
import type { RefObject } from "react";
import { mapValues } from "lodash";
import type { Group as ThreeGroup } from "three";
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
      const refs = { default: createRef<ThreeGroup>() } as Record<
        string,
        RefObject<ThreeGroup>
      >;
      const newElement: RenderGroup = createDefaultGroup({
        name,
        root: true,
        refs,
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
      const refs = mapValues(worldRootEntry.refs, () =>
        createRef<ThreeGroup>(),
      ) as Record<string, RefObject<ThreeGroup>>;
      const newChild: RenderGroup = createDefaultGroup({ name, root, refs });
      worldRootEntry.children.push(newChild.id);
      state.world[newChild.id] = newChild;
      state.elementSelection = [buildSelection(newChild.id)];
    }
  }
}
