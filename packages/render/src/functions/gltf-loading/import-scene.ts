import { Object3D, Group } from "three";
import { AnimatableValue, RawVector2 } from "utils";
import { World } from "../../types";
import { importGroup } from "./import-group";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importScene(
  scene: Group,
  namespaces: string[],
  rootBounds: {
    center: RawVector2;
    size: RawVector2;
  },
): [World, Record<string, AnimatableValue>] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};

  const [newWorldItems, newAnimatables, _newColors] = importGroup(
    scene as Group,
    namespaces,
    {},
    rootBounds,
  );
  world = { ...world, ...newWorldItems };
  animatables = { ...animatables, ...newAnimatables };
  return [world, animatables];
}
