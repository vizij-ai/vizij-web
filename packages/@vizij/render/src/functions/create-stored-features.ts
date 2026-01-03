import { mapValues } from "lodash";
import type { AnimatableValue } from "@vizij/utils";
import type {
  Feature,
  StaticFeature,
  StoredAnimatedFeature,
} from "../types/feature";

export function createStoredFeatures<T>(
  objectFeatures: Record<keyof T, Feature>,
  animatableValues: Record<string, AnimatableValue>,
): Record<keyof T, StaticFeature | StoredAnimatedFeature> {
  return mapValues(objectFeatures, (feat) => {
    if (feat.animated) {
      const storedFeat: StoredAnimatedFeature = {
        animated: true,
        value: animatableValues[feat.value],
        ...(feat.label ? { label: feat.label } : {}),
      };
      return storedFeat;
    } else {
      const staticFeature = feat as StaticFeature;
      return staticFeature.label ? { ...staticFeature } : staticFeature;
    }
  });
}
