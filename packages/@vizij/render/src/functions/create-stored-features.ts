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
  const stored = Object.entries(objectFeatures as Record<string, Feature>).map(
    ([key, feat]): [string, StaticFeature | StoredAnimatedFeature] => {
      if (feat.animated) {
        const storedFeat: StoredAnimatedFeature = {
          animated: true,
          value: animatableValues[feat.value],
          ...(feat.label ? { label: feat.label } : {}),
        };
        return [key, storedFeat];
      }
      const staticFeature = feat as StaticFeature;
      return [key, staticFeature.label ? { ...staticFeature } : staticFeature];
    },
  );
  return Object.fromEntries(stored) as Record<
    keyof T,
    StaticFeature | StoredAnimatedFeature
  >;
}
