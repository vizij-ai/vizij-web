import { Object3D, Group, Mesh } from "three";
import { AnimatableValue } from "@semio/utils";
import { World, Group as VizijGroup } from "../../types";
import { importMesh } from "./import-mesh";
import { importGroup } from "./import-group";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importScene(
  scene: Group,
  namespaces: string[],
): [World, Record<string, AnimatableValue>] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};

  scene.children.forEach((child) => {
    if ((child as Mesh).isMesh) {
      // Create a wrapper group for the object that can act as root
      const wrapperGroup = new Group();
      const [newGroupWorldItems, newGroupAnimatables] = importGroup(wrapperGroup, namespaces, true);
      const newVizijGroup = newGroupWorldItems[wrapperGroup.uuid];
      (newVizijGroup as VizijGroup).children.push(child.uuid);
      world = { ...world, [newVizijGroup.id]: newVizijGroup };
      animatables = { ...animatables, ...newGroupAnimatables };
      const [newWorldItems, newAnimatables] = importMesh(child as Mesh, namespaces);
      world = { ...world, ...newWorldItems };
      animatables = { ...animatables, ...newAnimatables };
    } else if ((child as Group).isGroup) {
      const [newWorldItems, newAnimatables] = importGroup(child as Group, namespaces, true);
      world = { ...world, ...newWorldItems };
      animatables = { ...animatables, ...newAnimatables };
    }
  });

  return [world, animatables];
}
