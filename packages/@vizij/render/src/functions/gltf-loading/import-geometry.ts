import type { BufferGeometry, Mesh } from "three";
import {
  type AnimatableValue,
  type AnimatableNumber,
  createBrowserSafeId,
} from "@vizij/utils";
import type { Feature } from "../../types";
import { sanitizeMorphKey } from "./morph-keys";

export function importGeometry(
  geometry: BufferGeometry,
  mesh: Mesh,
): [
  Record<string, Feature>,
  Record<string, AnimatableValue>,
  string[] | undefined,
] {
  const features: Record<string, Feature> = {};
  const animatableValues: Record<string, AnimatableValue> = {};
  const morphIds: string[] = [];

  const morphTargets = mesh.morphTargetDictionary;
  if (!morphTargets) {
    return [features, animatableValues, undefined];
  } else {
    const usedKeys = new Set<string>();
    Object.entries(mesh.morphTargetDictionary ?? {}).forEach(
      ([name, index]) => {
        const morphId = createBrowserSafeId();
        const featureKey = sanitizeMorphKey(name, index, usedKeys);
        morphIds.push(featureKey);
        features[featureKey] = {
          animated: true,
          value: morphId,
        };
        const displayName =
          name && name.trim().length > 0 ? name.trim() : featureKey;
        const animatableMorphValue: AnimatableNumber = {
          id: morphId,
          name: `${mesh.name ?? "Shape"} ${displayName}`,
          type: "number",
          default: mesh.morphTargetInfluences?.[index] ?? 0,
          constraints: {
            min: -1,
            max: 1,
          },
          pub: {
            public: true,
            output: displayName,
          },
        };
        animatableValues[morphId] = animatableMorphValue;
      },
    );
    return [features, animatableValues, morphIds];
  }
}
