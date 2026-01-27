import type { Group } from "three";
import { Object3D } from "three";
import type { AnimatableValue, RawVector2 } from "@vizij/utils";
import type { World } from "../../types";
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

  const [newWorldItems, newAnimatables] = importGroup(
    scene as Group,
    namespaces,
    {},
    rootBounds,
  );
  world = { ...world, ...newWorldItems };
  animatables = { ...animatables, ...newAnimatables };
  return [world, animatables];
}
