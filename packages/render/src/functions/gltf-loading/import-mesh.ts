import {
  Object3D,
  Mesh,
  MeshStandardMaterial,
  MeshPhongMaterial,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshLambertMaterial,
} from "three";
import { AnimatableEuler, AnimatableValue, AnimatableVector3 } from "@semio/utils";
import { World, Shape, ShapeMaterial } from "../../types";
import { namespaceArrayToRefs } from "../util";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importMesh(
  mesh: Mesh,
  namespaces: string[],
): [World, Record<string, AnimatableValue>] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};

  const translationAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    type: "vector3",
    default: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
    constraints: {},
  };
  animatables = { ...animatables, [translationAnimatable.id]: translationAnimatable };

  const rotationAnimatable: AnimatableEuler = {
    id: crypto.randomUUID(),
    type: "euler",
    default: { x: mesh.rotation.x, y: mesh.position.y, z: mesh.position.z },
    constraints: {},
  };
  animatables = { ...animatables, [rotationAnimatable.id]: rotationAnimatable };

  const scaleAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    type: "vector3",
    default: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
    constraints: {},
  };
  animatables = { ...animatables, [scaleAnimatable.id]: scaleAnimatable };

  const newShape: Shape = {
    id: mesh.uuid,
    name: mesh.name,
    geometry: mesh.geometry,
    material: getShapeMaterial(mesh),
    type: "shape",
    tags: [],
    features: {
      translation: { animated: true, value: translationAnimatable.id },
      rotation: { animated: true, value: rotationAnimatable.id },
      scale: { animated: true, value: scaleAnimatable.id },
    },
    refs: namespaceArrayToRefs(namespaces),
  };
  world = { ...world, [newShape.id]: newShape };

  return [world, animatables];
}

function getShapeMaterial(mesh: Mesh): ShapeMaterial {
  const material = mesh.material;
  if ((material as MeshStandardMaterial).isMeshStandardMaterial) {
    return ShapeMaterial.Standard;
  } else if ((material as MeshPhongMaterial).isMeshPhongMaterial) {
    return ShapeMaterial.Phong;
  } else if ((material as MeshBasicMaterial).isMeshBasicMaterial) {
    return ShapeMaterial.Basic;
  } else if ((material as MeshNormalMaterial).isMeshNormalMaterial) {
    return ShapeMaterial.Normal;
  } else if ((material as MeshLambertMaterial).isMeshLambertMaterial) {
    return ShapeMaterial.Lambert;
  } else {
    return ShapeMaterial.Standard;
  }
}
