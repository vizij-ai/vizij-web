import { createRef } from "react";
import * as THREE from "three";
import { Group, Mesh } from "three";
import { AnimatableValue, RawVector2 } from "@semio/utils";
import {
  World,
  RenderableBase,
  StoredRenderable,
  Group as VizijGroup,
  Shape,
  StaticFeature,
  AnimatedFeature,
  Ellipse,
  Rectangle,
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

  if (!aggressiveImport) {
    group.traverse((child) => {
      if (child.userData?.gltfExtensions?.RobotData) {
        const data = child.userData.gltfExtensions
          .RobotData as StoredRenderable;
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
    });
  } else if (rootBounds) {
    // Using an aggressive import that converts all three elements into their direct vizij counterparts
    const [newWorldData, newAnimatableData] = importScene(
      group,
      namespaces,
      rootBounds!,
    );
    Object.assign(worldData, newWorldData);
    Object.assign(animatableData, newAnimatableData);
  } else {
    // Root bounds are expected if using an aggressive import
    throw new Error("Root bounds are expected if using an aggressive import");
  }

  // console.log("worldData", worldData);
  return [worldData, animatableData];
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
