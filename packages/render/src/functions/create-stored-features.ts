import { mapValues } from "lodash";
import { AnimatableValue } from "@semio/utils";
import { Feature, StaticFeature, StoredAnimatedFeature } from "../types/feature";

export function createStoredFeatures<T>(
  objectFeatures: Record<keyof T, Feature>,
  animatableValues: Record<string, AnimatableValue>,
): Record<keyof T, StaticFeature | StoredAnimatedFeature> {
  return mapValues(objectFeatures, (feat) => {
    if (feat.animated) {
      const storedFeat: StoredAnimatedFeature = {
        animated: true,
        value: animatableValues[feat.value],
      };
      return storedFeat;
    } else {
      return feat as StaticFeature;
    }
  });
}
