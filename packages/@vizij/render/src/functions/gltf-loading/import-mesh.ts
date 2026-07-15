import type {
  Mesh,
  Group,
  MeshStandardMaterial,
  MeshPhongMaterial,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshLambertMaterial,
} from "three";
import { Object3D } from "three";
import type {
  AnimatableEuler,
  AnimatableValue,
  AnimatableVector3,
  AnimatableColor,
  AnimatableNumber,
} from "@vizij/utils";
import { createBrowserSafeId } from "@vizij/utils";
import type { World, Shape } from "../../types";
import { ShapeMaterial } from "../../types";
import { namespaceArrayToRefs } from "../util";
import { importGeometry } from "./import-geometry";
import { importGroup } from "./import-group";

Object3D.DEFAULT_UP.set(0, 0, 1);

/**
 * Animatable ids created for a single (possibly shared) material, keyed by
 * material property. Used to dedup animatables across meshes that share a
 * named material.
 */
export interface MaterialAnimatableIds {
  color: string;
  opacity: string;
  roughness?: string;
  metalness?: string;
  emissive?: string;
  emissiveIntensity?: string;
  shininess?: string;
  specular?: string;
}

export function importMesh(
  mesh: Mesh,
  namespaces: string[],
  colorLookup: Record<string, MaterialAnimatableIds>,
): [
  World,
  Record<string, AnimatableValue>,
  string,
  Record<string, MaterialAnimatableIds>,
] {
  let world: World = {};
  let animatables: Record<string, AnimatableValue> = {};
  let newColorLookup: Record<string, MaterialAnimatableIds> = {};

  const translationAnimatable: AnimatableVector3 = {
    id: createBrowserSafeId(),
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
    id: createBrowserSafeId(),
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
    id: createBrowserSafeId(),
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

  const material = mesh.material as MeshStandardMaterial;
  const color = material.color;
  const colorName: string | undefined = material.name;
  const label = (suffix: string): string =>
    colorName ? `${colorName} ${suffix}` : `${mesh.name ?? "Mesh"} ${suffix}`;

  const makeNumberAnimatable = (
    suffix: string,
    value: number,
    constraints: AnimatableNumber["constraints"],
  ): AnimatableNumber => ({
    id: createBrowserSafeId(),
    name: label(suffix),
    type: "number",
    default: value,
    constraints,
    pub: {
      public: true,
      output: label(suffix),
    },
  });

  const makeColorAnimatable = (
    suffix: string,
    value: { r: number; g: number; b: number },
  ): AnimatableColor => ({
    id: createBrowserSafeId(),
    name: label(suffix),
    type: "rgb",
    default: { r: value.r, g: value.g, b: value.b },
    constraints: {
      min: [0, 0, 0],
      max: [1, 1, 1],
    },
    pub: {
      public: true,
      output: label(suffix),
    },
  });

  const colorAnimatable: AnimatableColor = {
    ...makeColorAnimatable("color", color),
    name: material.name ?? `${mesh.name ?? "Mesh"} color`,
  };
  const opacityAnimatable = makeNumberAnimatable("opacity", material.opacity, {
    min: 0,
    max: 1,
  });

  // Only emit PBR features that actually exist on the detected material type.
  const materialAnimatables: AnimatableValue[] = [
    colorAnimatable,
    opacityAnimatable,
  ];
  let roughnessAnimatable: AnimatableNumber | undefined;
  let metalnessAnimatable: AnimatableNumber | undefined;
  let emissiveAnimatable: AnimatableColor | undefined;
  let emissiveIntensityAnimatable: AnimatableNumber | undefined;
  let shininessAnimatable: AnimatableNumber | undefined;
  let specularAnimatable: AnimatableColor | undefined;
  if (material.isMeshStandardMaterial) {
    roughnessAnimatable = makeNumberAnimatable(
      "roughness",
      material.roughness,
      {
        min: 0,
        max: 1,
      },
    );
    metalnessAnimatable = makeNumberAnimatable(
      "metalness",
      material.metalness,
      {
        min: 0,
        max: 1,
      },
    );
    emissiveAnimatable = makeColorAnimatable("emissive", material.emissive);
    emissiveIntensityAnimatable = makeNumberAnimatable(
      "emissive intensity",
      material.emissiveIntensity,
      { min: 0 },
    );
    materialAnimatables.push(
      roughnessAnimatable,
      metalnessAnimatable,
      emissiveAnimatable,
      emissiveIntensityAnimatable,
    );
  } else if ((mesh.material as MeshPhongMaterial).isMeshPhongMaterial) {
    const phong = mesh.material as MeshPhongMaterial;
    shininessAnimatable = makeNumberAnimatable("shininess", phong.shininess, {
      min: 0,
    });
    emissiveAnimatable = makeColorAnimatable("emissive", phong.emissive);
    emissiveIntensityAnimatable = makeNumberAnimatable(
      "emissive intensity",
      phong.emissiveIntensity,
      { min: 0 },
    );
    specularAnimatable = makeColorAnimatable("specular", phong.specular);
    materialAnimatables.push(
      shininessAnimatable,
      emissiveAnimatable,
      emissiveIntensityAnimatable,
      specularAnimatable,
    );
  }

  let materialIds: MaterialAnimatableIds;
  if (colorName && colorLookup[colorName]) {
    // A material with this name has already been imported. Share its animatables.
    materialIds = colorLookup[colorName];
  } else {
    materialIds = {
      color: colorAnimatable.id,
      opacity: opacityAnimatable.id,
      roughness: roughnessAnimatable?.id,
      metalness: metalnessAnimatable?.id,
      emissive: emissiveAnimatable?.id,
      emissiveIntensity: emissiveIntensityAnimatable?.id,
      shininess: shininessAnimatable?.id,
      specular: specularAnimatable?.id,
    };
    materialAnimatables.forEach((animatable) => {
      animatables = { ...animatables, [animatable.id]: animatable };
    });
    if (colorName) {
      newColorLookup[colorName] = materialIds;
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
      color: { animated: true, value: materialIds.color },
      opacity: { animated: true, value: materialIds.opacity },
      ...(materialIds.roughness
        ? { roughness: { animated: true, value: materialIds.roughness } }
        : {}),
      ...(materialIds.metalness
        ? { metalness: { animated: true, value: materialIds.metalness } }
        : {}),
      ...(materialIds.emissive
        ? { emissive: { animated: true, value: materialIds.emissive } }
        : {}),
      ...(materialIds.emissiveIntensity
        ? {
            emissiveIntensity: {
              animated: true,
              value: materialIds.emissiveIntensity,
            },
          }
        : {}),
      ...(materialIds.shininess
        ? { shininess: { animated: true, value: materialIds.shininess } }
        : {}),
      ...(materialIds.specular
        ? { specular: { animated: true, value: materialIds.specular } }
        : {}),
      ...geometryFeatures,
    },
    children: children.length > 0 ? children : undefined,
    refs: namespaceArrayToRefs(namespaces),
  };
  world = { ...world, [newShape.id]: newShape };

  return [world, animatables, newShape.id, newColorLookup];
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
