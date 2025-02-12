import { Object3D, Group, Mesh } from "three";
import { AnimatableEuler, AnimatableValue, AnimatableVector3 } from "@semio/utils";
import { World, Group as VizijGroup } from "../../types";
import { namespaceArrayToRefs } from "../util";
import { importMesh } from "./import-mesh";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importGroup(
  group: Group,
  namespaces: string[],
  colorLookup: Record<string, [string, string, boolean]>,
  root?: boolean,
): [World, Record<string, AnimatableValue>, string, Record<string, [string, string, boolean]>] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};
  let newColorLookup: Record<string, [string, string, boolean]> = {};
  const children: string[] = [];

  const translationAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${group.name ?? "Group"} translation`,
    type: "vector3",
    default: { x: group.position.x, y: group.position.y, z: group.position.z },
    constraints: {},
  };
  animatables = { ...animatables, [translationAnimatable.id]: translationAnimatable };

  const rotationAnimatable: AnimatableEuler = {
    id: crypto.randomUUID(),
    name: `${group.name ?? "Group"} rotation`,
    type: "euler",
    default: { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z },
    constraints: {},
  };
  animatables = { ...animatables, [rotationAnimatable.id]: rotationAnimatable };

  const scaleAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${group.name ?? "Group"} scale`,
    type: "vector3",
    default: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
    constraints: {},
  };
  animatables = { ...animatables, [scaleAnimatable.id]: scaleAnimatable };

  group.children.forEach((child) => {
    if ((child as Mesh).isMesh) {
      const [newWorldItems, newAnimatables, childId, newMeshColors] = importMesh(
        child as Mesh,
        namespaces,
        { ...colorLookup, ...newColorLookup },
      );
      newColorLookup = { ...newColorLookup, ...newMeshColors };
      world = { ...world, ...newWorldItems };
      animatables = { ...animatables, ...newAnimatables };
      children.push(childId);
    } else if ((child as Group).isGroup || (child.isObject3D && child.children.length !== 0)) {
      const [newWorldItems, newAnimatables, childId, newMeshColors] = importGroup(
        child as Group,
        namespaces,
        { ...colorLookup, ...newColorLookup },
      );
      newColorLookup = { ...newColorLookup, ...newMeshColors };
      world = { ...world, ...newWorldItems };
      animatables = { ...animatables, ...newAnimatables };
      children.push(childId);
    }
  });

  const newGroup: VizijGroup = {
    id: group.uuid,
    name: group.name,
    type: "group",
    tags: [],
    features: {
      translation: { animated: true, value: translationAnimatable.id },
      rotation: { animated: true, value: rotationAnimatable.id },
      scale: { animated: true, value: scaleAnimatable.id },
    },
    root: root ?? false,
    children,
    refs: namespaceArrayToRefs(namespaces),
  };
  world = { ...world, [newGroup.id]: newGroup };

  return [world, animatables, newGroup.id, newColorLookup];
}
