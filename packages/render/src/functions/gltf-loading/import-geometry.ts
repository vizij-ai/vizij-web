import { BufferGeometry, Mesh } from "three";
import { AnimatableValue, AnimatableNumber } from "@semio/utils";
import { Feature } from "../../types";

export function importGeometry(
  geometry: BufferGeometry,
  mesh: Mesh,
): [Record<string, Feature>, Record<string, AnimatableValue>, string[] | undefined] {
  const features: Record<string, Feature> = {};
  const animatableValues: Record<string, AnimatableValue> = {};
  const morphIds: string[] = [];

  const morphTargets = mesh.morphTargetDictionary;
  if (!morphTargets) {
    return [features, animatableValues, undefined];
  } else {
    Object.entries(mesh.morphTargetDictionary ?? {}).forEach(([name, index]) => {
      const morphId = crypto.randomUUID();
      morphIds.push(morphId);
      features[morphId] = {
        animated: true,
        value: morphId,
      };
      const animatableMorphValue: AnimatableNumber = {
        id: morphId,
        name,
        type: "number",
        default: mesh.morphTargetInfluences?.[index] ?? 0,
        constraints: {
          min: 0,
          max: 1,
        },
      };
      animatableValues[morphId] = animatableMorphValue;
    });
    return [features, animatableValues, morphIds];
  }
}
