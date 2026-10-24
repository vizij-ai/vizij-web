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
import { EmptyModelError } from "../empty-model-error";
import { mapFeatures } from "./map-features";
import { importScene } from "./import-scene";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export function traverseThree(
  group: Group,
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
      // No RobotData and nothing to measure: the file holds no face.
      throw new EmptyModelError(
        "The GLB has no RobotData and no mesh, ellipse or rectangle to import",
      );
    }

    const [newWorldData, newAnimatableData] = importScene(
      group,
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
  "emissive",
  "emissiveIntensity",
  "specular",
];

const MATERIAL_NAME_SUFFIXES = [
  " color",
  " colours",
  " colour",
  " opacity",
  " roughness",
  " metalness",
  " shininess",
  " emissive intensity",
  " emissive",
  " specular",
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

/**
 * A translation and a rotation, each carried whole or by its components
 * (Semio Studio's per-axis form).
 */
const TRANSFORM: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["translation", ["x", "y", "z"]],
  ["rotation", ["r", "p", "y"]],
];

/**
 * The features every element of a type carries: its transform, and an
 * ellipse's or a rectangle's width and height.
 */
const REQUIRED_FEATURES = {
  group: TRANSFORM,
  shape: TRANSFORM,
  ellipse: [...TRANSFORM, ["width", []], ["height", []]],
  rectangle: [...TRANSFORM, ["width", []], ["height", []]],
} as const;

/**
 * Throws unless `value` carries every feature an element of type `kind`
 * requires, a compound one whole or by at least one of its components.
 */
function assertRequiredFeatures(
  kind: keyof typeof REQUIRED_FEATURES,
  value: unknown,
): void {
  if (!value || typeof value !== "object") {
    throw new Error("Expected object");
  }
  const missing = REQUIRED_FEATURES[kind]
    .filter(
      ([name, axes]) =>
        !(name in value) && !axes.some((axis) => `${name}.${axis}` in value),
    )
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `An element of type ${kind} lacks ${missing.join(", ")} in its features`,
    );
  }
}

function isGroupFeatures(
  value: unknown,
): asserts value is VizijGroup["features"] {
  assertRequiredFeatures("group", value);
}

function isShapeFeatures(value: unknown): asserts value is Shape["features"] {
  assertRequiredFeatures("shape", value);
}

function isEllipseFeatures(
  value: unknown,
): asserts value is Ellipse["features"] {
  assertRequiredFeatures("ellipse", value);
}

function isRectangleFeatures(
  value: unknown,
): asserts value is Rectangle["features"] {
  assertRequiredFeatures("rectangle", value);
}

/**
 * Half the extent of the unit shape an `ellipse` or a `rectangle` element is
 * drawn from, along its node's X and Y: a circle of radius 1 and a 1 × 1
 * square in the XY plane, which the node's scale stretches to the element's
 * `width` and `height`.
 */
const PRIMITIVE_HALF_EXTENT: Readonly<Record<string, number>> = {
  ellipse: 1,
  rectangle: 0.5,
};

/**
 * Grow `box` by every `ellipse` and `rectangle` node under `root`: such a
 * node carries no mesh — the renderer draws it from its RobotData — so its
 * extent is its unit shape under its world matrix. An ellipse grows the box
 * by its exact extent; a rectangle by its four corners'.
 */
function expandByPrimitives(box: THREE.Box3, root: Object3D): void {
  const center = new THREE.Vector3();
  const half = new THREE.Vector3();
  root.traverse((object) => {
    if ((object as Mesh).isMesh) {
      return;
    }
    const type = object.userData?.gltfExtensions?.RobotData?.type;
    const extent =
      typeof type === "string" ? PRIMITIVE_HALF_EXTENT[type] : undefined;
    if (extent === undefined) {
      return;
    }
    // Columns 0 and 1 of the world matrix carry the node's X and Y axes.
    const e = object.matrixWorld.elements;
    const along =
      type === "ellipse"
        ? (a: number, b: number) => Math.hypot(a, b)
        : (a: number, b: number) => Math.abs(a) + Math.abs(b);
    half.set(along(e[0], e[4]), along(e[1], e[5]), along(e[2], e[6]));
    half.multiplyScalar(extent);
    center.setFromMatrixPosition(object.matrixWorld);
    box.expandByPoint(center.clone().sub(half));
    box.expandByPoint(center.clone().add(half));
  });
}

/**
 * The bounds of everything under `group` in the XY plane: its meshes, and its
 * `ellipse` and `rectangle` elements' shapes. `null` when it holds neither.
 */
export function deriveRootBounds(
  group: Object3D,
): { center: RawVector2; size: RawVector2 } | null {
  const boundingBox = new THREE.Box3().setFromObject(group);
  // `setFromObject` has brought every world matrix under `group` up to date.
  expandByPrimitives(boundingBox, group);
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
