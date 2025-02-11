import { Object3D, Group } from "three";
import { AnimatableValue } from "@semio/utils";
import { World } from "../../types";
import { importGroup } from "./import-group";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importScene(
  scene: Group,
  namespaces: string[],
): [World, Record<string, AnimatableValue>] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};

  const [newWorldItems, newAnimatables, _newColors] = importGroup(
    scene as Group,
    namespaces,
    {},
    true,
  );
  world = { ...world, ...newWorldItems };
  animatables = { ...animatables, ...newAnimatables };
  return [world, animatables];
}
