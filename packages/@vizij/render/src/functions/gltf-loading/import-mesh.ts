import {
  Object3D,
  Mesh,
  MeshStandardMaterial,
  MeshPhongMaterial,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
} from "three";
import {
  AnimatableEuler,
  AnimatableValue,
  AnimatableVector3,
  AnimatableColor,
  AnimatableNumber,
} from "@vizij/utils";
import { World, Shape, ShapeMaterial } from "../../types";
import { namespaceArrayToRefs } from "../util";
import { importGeometry } from "./import-geometry";

Object3D.DEFAULT_UP.set(0, 0, 1);

export function importMesh(
  mesh: Mesh,
  namespaces: string[],
  colorLookup: Record<string, [string, string, boolean]>,
): [
  World,
  Record<string, AnimatableValue>,
  string,
  Record<string, [string, string, boolean]>,
] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};
  let newColorLookup: Record<string, [string, string, boolean]> = {};

  const translationAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} translation`,
    type: "vector3",
    default: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
    constraints: {},
    pub: {
      public: true,
      output: `${mesh.name ?? "Mesh"} translation`,
      units: "m",
    },
  };
  animatables = {
    ...animatables,
    [translationAnimatable.id]: translationAnimatable,
  };

  const rotationAnimatable: AnimatableEuler = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} rotation`,
    type: "euler",
    default: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
    constraints: {},
    pub: {
      public: true,
      output: `${mesh.name ?? "Mesh"} rotation`,
      units: "rad",
    },
  };
  animatables = { ...animatables, [rotationAnimatable.id]: rotationAnimatable };

  const scaleAnimatable: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: `${mesh.name ?? "Mesh"} scale`,
    type: "vector3",
    default: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
    constraints: {},
    pub: {
      public: true,
      output: `${mesh.name ?? "Mesh"} scale`,
    },
  };
  animatables = { ...animatables, [scaleAnimatable.id]: scaleAnimatable };

  const color = (mesh.material as MeshStandardMaterial).color;
  let useEmissive = false;
  if (
    color.r === 0 &&
    color.g === 0 &&
    color.b === 0 &&
    (mesh.material as MeshStandardMaterial).emissive
  ) {
    color.copy((mesh.material as MeshPhysicalMaterial).emissive);
    useEmissive = true;
  }
  const colorName: string | undefined = (mesh.material as MeshStandardMaterial)
    .name;
  const colorAnimatable: AnimatableColor = {
    id: crypto.randomUUID(),
    name:
      (mesh.material as MeshStandardMaterial).name ??
      `${mesh.name ?? "Mesh"} color`,
    type: "rgb",
    default: { r: color.r, g: color.g, b: color.b },
    constraints: {
      min: [0, 0, 0],
      max: [1, 1, 1],
    },
    pub: {
      public: true,
      output: (mesh.material as MeshStandardMaterial).name
        ? `${(mesh.material as MeshStandardMaterial).name} color`
        : `${mesh.name ?? "Mesh"} color`,
    },
  };

  const opacityAnimatable: AnimatableNumber = {
    id: crypto.randomUUID(),
    name: (mesh.material as MeshStandardMaterial).name
      ? `${(mesh.material as MeshStandardMaterial).name} opacity`
      : `${mesh.name ?? "Mesh"} opacity`,
    type: "number",
    default: (mesh.material as MeshStandardMaterial).opacity,
    constraints: {
      min: 0,
      max: 1,
    },
    pub: {
      public: true,
      output: (mesh.material as MeshStandardMaterial).name
        ? `${(mesh.material as MeshStandardMaterial).name} opacity`
        : `${mesh.name ?? "Mesh"} opacity`,
    },
  };
  let colorId = colorAnimatable.id;
  let opacityId = opacityAnimatable.id;

  if (colorName && colorLookup[colorName]) {
    // A color with this name has already been defined. Use that one instead.
    colorId = colorLookup[colorName][0];
    opacityId = colorLookup[colorName][1];
    useEmissive = colorLookup[colorName][2];
  } else {
    animatables = { ...animatables, [colorAnimatable.id]: colorAnimatable };
    animatables = { ...animatables, [opacityAnimatable.id]: opacityAnimatable };
    if (colorName) {
      newColorLookup[colorName] = [
        colorAnimatable.id,
        opacityAnimatable.id,
        useEmissive,
      ];
    }
  }

  const [geometryFeatures, geometryAnimatables, morphTargets] = importGeometry(
    mesh.geometry,
    mesh,
  );
  animatables = { ...animatables, ...geometryAnimatables };

  const children: string[] = [];

  mesh.children.forEach((child) => {
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
    }
  });

  const newShape: Shape = {
    id: mesh.uuid,
    name: mesh.name,
    geometry: mesh.geometry,
    material: getShapeMaterial(mesh, useEmissive),
    type: "shape",
    tags: [],
    morphTargets,
    features: {
      translation: { animated: true, value: translationAnimatable.id },
      rotation: { animated: true, value: rotationAnimatable.id },
      scale: { animated: true, value: scaleAnimatable.id },
      color: { animated: true, value: colorId },
      opacity: { animated: true, value: opacityId },
      ...geometryFeatures,
    },
    children: children.length > 0 ? children : undefined,
    refs: namespaceArrayToRefs(namespaces),
  };
  world = { ...world, [newShape.id]: newShape };

  return [world, animatables, newShape.id, newColorLookup];
}

function getShapeMaterial(mesh: Mesh, useEmissive: boolean): ShapeMaterial {
  const material = mesh.material;
  if (useEmissive) {
    return ShapeMaterial.Basic;
  }
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
