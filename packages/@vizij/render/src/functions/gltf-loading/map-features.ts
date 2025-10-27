import { type AnimatableValue } from "@vizij/utils";
import {
  AnimatedFeature,
  StaticFeature,
  StoredAnimatedFeature,
} from "../../types/feature";

export function mapFeatures(
  features: Record<string, StoredAnimatedFeature | StaticFeature>,
): [
  Record<string, AnimatedFeature | StaticFeature>,
  Record<string, AnimatableValue>,
] {
  const animatableValues: Record<string, AnimatableValue> = {};
  const mappedFeatures: Record<string, AnimatedFeature | StaticFeature> = {};

  Object.keys(features).forEach((f) => {
    const feature = features[f] as StoredAnimatedFeature | StaticFeature;
    // console.log("Mapping feature", feature);
    if (feature.animated) {
      const animatedValue = feature.value;
      // console.log("Mapping animated value", f, animatedValue);
      mappedFeatures[f] = {
        animated: true,
        value: animatedValue.id,
        ...(feature.label ? { label: feature.label } : {}),
      };
      animatableValues[animatedValue.id] = animatedValue;
    } else {
      const { animated, value, label } = feature;
      mappedFeatures[f] = label
        ? { animated, value, label }
        : { animated, value };
    }
  });

  return [mappedFeatures, animatableValues];
}
