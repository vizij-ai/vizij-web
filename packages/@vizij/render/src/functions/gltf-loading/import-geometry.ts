import type { BufferGeometry, Mesh } from "three";
import type { AnimatableValue, AnimatableNumber } from "@vizij/utils";
import type { Feature } from "../../types";

function sanitizeMorphKey(
  name: string,
  fallbackIndex: number,
  used: Set<string>,
): string {
  const baseName =
    name && name.trim().length > 0 ? name.trim() : `morph_${fallbackIndex + 1}`;
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const safeBase = slug.length > 0 ? slug : `morph_${fallbackIndex + 1}`;
  let candidate = safeBase;
  let counter = 1;
  while (used.has(candidate)) {
    candidate = `${safeBase}_${counter++}`;
  }
  used.add(candidate);
  return candidate;
}

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
        const morphId = crypto.randomUUID();
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
