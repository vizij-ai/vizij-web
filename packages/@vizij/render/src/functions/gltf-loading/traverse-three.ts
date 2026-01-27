import { createRef } from "react";
import * as THREE from "three";
import type { Group, Mesh, Material, Object3D } from "three";
import type { AnimatableValue, RawVector2 } from "@vizij/utils";
import type {
  World,
  RenderableBase,
  StoredRenderable,
  Group as VizijGroup,
  Shape,
  StaticFeature,
  AnimatedFeature,
  Ellipse,
  Rectangle,
  StoredAnimatedFeature,
} from "../../types";
import { mapFeatures } from "./map-features";
import { importScene } from "./import-scene";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export function traverseThree(
  group: Group,
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): [World, Record<string, AnimatableValue>] {
  const worldData: World = {};
  const animatableData: Record<string, AnimatableValue> = {};

  let hasRobotData = false;
  group.traverse((child) => {
    if (child.userData?.gltfExtensions?.RobotData) {
      hasRobotData = true;
    }
  });

  const useRobotData = !aggressiveImport || hasRobotData;

  if (useRobotData) {
    const stack: Object3D[] = [group];
    while (stack.length > 0) {
      const child = stack.pop()!;
      if (child.userData?.gltfExtensions?.RobotData) {
        const data = child.userData.gltfExtensions
          .RobotData as StoredRenderable;
        applyStoredRenderableNames(child, data);
        let loadedData: RenderableBase;
        let mappedFeatures: Record<string, AnimatedFeature | StaticFeature>;
        let animatableValues: Record<string, AnimatableValue>;

        // console.log("FEATURES", robotData.features);
        switch (data.type) {
          case "group":
            loadedData = {
              ...data,
              refs: namespaces.reduce(
                (acc, ns) => ({ ...acc, [ns]: createRef<Group>() }),
                {},
              ),
            } as VizijGroup;
            [mappedFeatures, animatableValues] = mapFeatures(data.features);
            isGroupFeatures(mappedFeatures);
            loadedData.features = mappedFeatures;
            Object.assign(animatableData, animatableValues);
            worldData[loadedData.id] = loadedData as VizijGroup;
            break;
          case "shape":
            loadedData = {
              ...data,
              geometry: (child as Mesh).geometry,
              refs: namespaces.reduce(
                (acc, ns) => ({ ...acc, [ns]: createRef<Mesh>() }),
                {},
              ),
            } as Shape;
            [mappedFeatures, animatableValues] = mapFeatures(data.features);
            isShapeFeatures(mappedFeatures);
            loadedData.features = mappedFeatures;
            Object.assign(animatableData, animatableValues);
            worldData[loadedData.id] = loadedData as Shape;
            break;
          case "ellipse":
            loadedData = {
              ...data,
              refs: namespaces.reduce(
                (acc, ns) => ({ ...acc, [ns]: createRef<Mesh>() }),
                {},
              ),
            } as Ellipse;
            [mappedFeatures, animatableValues] = mapFeatures(data.features);
            isEllipseFeatures(mappedFeatures);
            loadedData.features = mappedFeatures;
            Object.assign(animatableData, animatableValues);
            worldData[loadedData.id] = loadedData as Shape;
            break;
          case "rectangle":
            loadedData = {
              ...data,
              refs: namespaces.reduce(
                (acc, ns) => ({ ...acc, [ns]: createRef<Mesh>() }),
                {},
              ),
            } as Rectangle;
            [mappedFeatures, animatableValues] = mapFeatures(data.features);
            isRectangleFeatures(mappedFeatures);
            loadedData.features = mappedFeatures;
            Object.assign(animatableData, animatableValues);
            worldData[loadedData.id] = loadedData as Shape;
            break;
          default:
            throw new Error(`Unhandled type`);
        }
      }
      if (child.children) {
        stack.push(...child.children);
      }
    }
  } else {
    const derivedRootBounds = rootBounds ?? deriveRootBounds(group);

    if (!derivedRootBounds) {
      throw new Error("Root bounds are expected if using an aggressive import");
    }

    const [newWorldData, newAnimatableData] = importScene(
      group,
      namespaces,
      derivedRootBounds,
    );
    Object.assign(worldData, newWorldData);
    Object.assign(animatableData, newAnimatableData);
  }

  // console.log("worldData", worldData);
  return [worldData, animatableData];
}

const MATERIAL_NAME_FEATURE_KEYS = [
  "color",
  "opacity",
  "roughness",
  "metalness",
  "shininess",
];

const MATERIAL_NAME_SUFFIXES = [
  " color",
  " colours",
  " colour",
  " opacity",
  " roughness",
  " metalness",
  " shininess",
];

function applyStoredRenderableNames(
  object: Object3D,
  data: StoredRenderable,
): void {
  if (typeof data.name === "string" && data.name.length > 0) {
    object.name = data.name;
  }

  if ((object as Group).isGroup) {
    const group = object as Group;
    if (typeof data.name === "string" && data.name.length > 0) {
      group.name = data.name;
    }
  }

  if ((object as Mesh).isMesh) {
    const mesh = object as Mesh;
    if (typeof data.name === "string" && data.name.length > 0) {
      mesh.name = data.name;
      if (mesh.geometry) {
        mesh.geometry.name = data.name;
      }
    }

    const inferredName = inferMaterialNameFromStoredRenderable(data);
    if (inferredName) {
      assignMaterialName(mesh.material, inferredName);
    }
  }
}

function assignMaterialName(
  material: Material | Material[] | undefined,
  name: string,
): void {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    material.forEach((mat) => {
      mat.name = name;
    });
  } else {
    material.name = name;
  }
}

function inferMaterialNameFromStoredRenderable(
  data: StoredRenderable,
): string | undefined {
  if (data.type !== "shape") {
    return undefined;
  }

  const features = data.features as Record<string, unknown>;

  for (const key of MATERIAL_NAME_FEATURE_KEYS) {
    const candidate = extractMaterialNameFromFeature(features[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function extractMaterialNameFromFeature(feature: unknown): string | undefined {
  if (!isStoredAnimatedFeature(feature)) {
    return undefined;
  }

  const animatableName = feature.value.name;
  if (!animatableName) {
    return undefined;
  }

  return stripMaterialSuffixes(animatableName);
}

function stripMaterialSuffixes(name: string): string {
  const trimmed = name.trim();
  const lowered = trimmed.toLowerCase();

  for (const suffix of MATERIAL_NAME_SUFFIXES) {
    if (lowered.endsWith(suffix)) {
      return trimmed.slice(0, trimmed.length - suffix.length).trim();
    }
  }

  return trimmed;
}

function isStoredAnimatedFeature(
  feature: unknown,
): feature is StoredAnimatedFeature {
  return (
    Boolean(feature) &&
    typeof feature === "object" &&
    (feature as StoredAnimatedFeature).animated === true &&
    "value" in (feature as StoredAnimatedFeature)
  );
}

function isGroupFeatures(
  value: unknown,
): asserts value is VizijGroup["features"] {
  if (!value || typeof value !== "object") {
    throw new Error("Expected object");
  }
  if (!["translation", "rotation"].every((key) => key in value)) {
    throw new Error("Expected translation and rotation keys in features");
  }
}

function isShapeFeatures(value: unknown): asserts value is Shape["features"] {
  if (!value || typeof value !== "object") {
    throw new Error("Expected object");
  }
  if (!["translation", "rotation"].every((key) => key in value)) {
    throw new Error("Expected translation and rotation keys in features");
  }
}

function isEllipseFeatures(
  value: unknown,
): asserts value is Ellipse["features"] {
  if (!value || typeof value !== "object") {
    throw new Error("Expected object");
  }
  if (
    !["translation", "rotation", "height", "width"].every((key) => key in value)
  ) {
    throw new Error(
      "Expected translation, rotation, width, and height keys in features",
    );
  }
}

function isRectangleFeatures(
  value: unknown,
): asserts value is Rectangle["features"] {
  if (!value || typeof value !== "object") {
    throw new Error("Expected object");
  }
  if (
    !["translation", "rotation", "height", "width"].every((key) => key in value)
  ) {
    throw new Error(
      "Expected translation, rotation, width, and height keys in features",
    );
  }
}

function deriveRootBounds(
  group: Group,
): { center: RawVector2; size: RawVector2 } | null {
  const boundingBox = new THREE.Box3().setFromObject(group);
  if (boundingBox.isEmpty()) {
    return null;
  }

  const { min, max } = boundingBox;
  if (
    !Number.isFinite(min.x) ||
    !Number.isFinite(min.y) ||
    !Number.isFinite(max.x) ||
    !Number.isFinite(max.y)
  ) {
    return null;
  }

  const width = max.x - min.x;
  const height = max.y - min.y;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  const safeWidth = Math.max(Math.abs(width), 1e-3);
  const safeHeight = Math.max(Math.abs(height), 1e-3);

  return {
    center: {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
    },
    size: {
      x: safeWidth,
      y: safeHeight,
    },
  };
}
