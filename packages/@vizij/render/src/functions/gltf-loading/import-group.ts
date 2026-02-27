import type { Group, Mesh } from "three";
import { Object3D } from "three";
import type {
  AnimatableEuler,
  AnimatableValue,
  AnimatableVector3,
  RawVector2,
} from "@vizij/utils";
import type { World, Group as VizijGroup } from "../../types";
import { namespaceArrayToRefs } from "../util";
import { importMesh } from "./import-mesh";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importGroup(
  group: Group,
  namespaces: string[],
  colorLookup: Record<string, [string, string, boolean]>,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): [
    World,
    Record<string, AnimatableValue>,
    string,
    Record<string, [string, string, boolean]>,
  ] {
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
    pub: {
      public: true,
      output: `${group.name ?? "Group"} translation`,
      units: "m",
    },
  };
  animatables = {
    ...animatables,
    [translationAnimatable.id]: translationAnimatable,
  };

  const rotationAnimatable: AnimatableEuler = {
    id: crypto.randomUUID(),
    name: `${group.name ?? "Group"} rotation`,
    type: "euler",
    default: { x: group.rotation.x, y: group.rotation.y, z: group.rotation.z },
    constraints: {},
    pub: {
      public: true,
      output: `${group.name ?? "Group"} rotation`,
      units: "rad",
    },
  };
  animatables = { ...animatables, [rotationAnimatable.id]: rotationAnimatable };

  const scaleAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${group.name ?? "Group"} scale`,
    type: "vector3",
    default: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
    constraints: {},
    pub: {
      public: true,
      output: `${group.name ?? "Group"} scale`,
    },
  };
  animatables = { ...animatables, [scaleAnimatable.id]: scaleAnimatable };

  group.children.forEach((child) => {
    if ((child as Mesh).isMesh) {
      const [newWorldItems, newAnimatables, childId, newMeshColors] =
        importMesh(child as Mesh, namespaces, {
          ...colorLookup,
          ...newColorLookup,
        });
      newColorLookup = { ...newColorLookup, ...newMeshColors };
      world = { ...world, ...newWorldItems };
      animatables = { ...animatables, ...newAnimatables };
      children.push(childId);
    } else if (shouldImportAsGroupChild(child)) {
      const [newWorldItems, newAnimatables, childId, newMeshColors] =
        importGroup(child as Group, namespaces, {
          ...colorLookup,
          ...newColorLookup,
        });
      newColorLookup = { ...newColorLookup, ...newMeshColors };
      world = { ...world, ...newWorldItems };
      animatables = { ...animatables, ...newAnimatables };
      children.push(childId);
    }
  });

  const newGroup: VizijGroup = {
    id: group.name || group.uuid,
    name: group.name,
    type: "group",
    tags: [],
    features: {
      translation: { animated: true, value: translationAnimatable.id },
      rotation: { animated: true, value: rotationAnimatable.id },
      scale: { animated: true, value: scaleAnimatable.id },
    },
    root: Boolean(rootBounds),
    rootBounds,
    children,
    refs: namespaceArrayToRefs<Group>(namespaces),
  };
  world = { ...world, [newGroup.id]: newGroup };

  return [world, animatables, newGroup.id, newColorLookup];
}

function shouldImportAsGroupChild(child: Object3D): boolean {
  if (!child.isObject3D) {
    return false;
  }
  if ((child as Mesh).isMesh) {
    return false;
  }
  if ((child as { isCamera?: boolean }).isCamera) {
    return false;
  }
  if ((child as { isLight?: boolean }).isLight) {
    return false;
  }
  if ((child as { isBone?: boolean }).isBone) {
    return false;
  }
  return true;
}
