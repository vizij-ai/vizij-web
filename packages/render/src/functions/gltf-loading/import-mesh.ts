import {
  Object3D,
  Mesh,
  MeshStandardMaterial,
  MeshPhongMaterial,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshLambertMaterial,
} from "three";
import {
  AnimatableEuler,
  AnimatableValue,
  AnimatableVector3,
  AnimatableColor,
  AnimatableNumber,
} from "@semio/utils";
import { World, Shape, ShapeMaterial } from "../../types";
import { namespaceArrayToRefs } from "../util";
import { importGeometry } from "./import-geometry";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importMesh(
  mesh: Mesh,
  namespaces: string[],
): [World, Record<string, AnimatableValue>, string] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};

  const translationAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} translation`,
    type: "vector3",
    default: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
    constraints: {},
  };
  animatables = { ...animatables, [translationAnimatable.id]: translationAnimatable };

  const rotationAnimatable: AnimatableEuler = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} rotation`,
    type: "euler",
    default: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
    constraints: {},
  };
  animatables = { ...animatables, [rotationAnimatable.id]: rotationAnimatable };

  const scaleAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} scale`,
    type: "vector3",
    default: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
    constraints: {},
  };
  animatables = { ...animatables, [scaleAnimatable.id]: scaleAnimatable };

  const color = (mesh.material as MeshStandardMaterial).color;
  const colorAnimatable: AnimatableColor = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} color`,
    type: "rgb",
    default: { r: color.r, g: color.g, b: color.b },
    constraints: {
      min: [0, 0, 0],
      max: [1, 1, 1],
    },
  };
  animatables = { ...animatables, [colorAnimatable.id]: colorAnimatable };

  const opacityAnimatable: AnimatableNumber = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} opacity`,
    type: "number",
    default: (mesh.material as MeshStandardMaterial).opacity,
    constraints: {
      min: 0,
      max: 1,
    },
  };
  animatables = { ...animatables, [opacityAnimatable.id]: opacityAnimatable };

  const [geometryFeatures, geometryAnimatables, morphTargets] = importGeometry(mesh.geometry, mesh);
  animatables = { ...animatables, ...geometryAnimatables };

  const newShape: Shape = {
    id: mesh.uuid,
    name: mesh.name,
    geometry: mesh.geometry,
    material: getShapeMaterial(mesh),
    type: "shape",
    tags: [],
    morphTargets,
    features: {
      translation: { animated: true, value: translationAnimatable.id },
      rotation: { animated: true, value: rotationAnimatable.id },
      scale: { animated: true, value: scaleAnimatable.id },
      color: { animated: true, value: colorAnimatable.id },
      opacity: { animated: true, value: opacityAnimatable.id },
      ...geometryFeatures,
    },
    refs: namespaceArrayToRefs(namespaces),
  };
  world = { ...world, [newShape.id]: newShape };

  return [world, animatables, newShape.id];
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
