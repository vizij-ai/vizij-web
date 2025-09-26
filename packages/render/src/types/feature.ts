import type { AnimatableValue, RawValue } from "utils";

/**
 * A wrapping type to reference an attribute that is animatable.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always true for an AnimatedFeature.
 * @param value - The id of the {@link AnimatableValue} used to populate this value.
 */
export interface AnimatedFeature {
  animated: true;
  value: string;
}

/**
 * A wrapping type to specify an attribute that is not animatable (i.e. static) directly.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always false for a StaticFeature.
 * @param value - The value {@link RawValue} of the feature.
 */
export interface StaticFeature {
  animated: false;
  value: RawValue;
}

/**
 * A wrapping type to specify an attribute that is animatable, modified to directly
 * include the {@link AnimatableValue} for storage.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always true for an AnimatedFeature.
 * @param value - The {@link AnimatableValue} used to populate this value.
 */
export interface StoredAnimatedFeature {
  animated: true;
  value: AnimatableValue;
}

/**
 * A wrapping type to reference an attribute that is either animatable or static.
 *
 * @param amimated - A boolean indicating whether the feature is animated.
 * @param value - The id of the {@link AnimatableValue} used to populate this value if animated, or the value {@link RawValue} if static.
 */
export type Feature = AnimatedFeature | StaticFeature;
