import type { AnimatableValue, RawValue } from "@vizij/utils";

/**
 * A wrapping type to reference an attribute that is animatable.
 *
 * @param amimated - A boolean indicating whether the feature is animated. Always true for an AnimatedFeature.
 * @param value - The id of the {@link AnimatableValue} used to populate this value.
 */
export interface AnimatedFeature {
  animated: true;
  value: string;
  label?: string;
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
  label?: string;
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
  label?: string;
}

/**
 * A wrapping type to reference an attribute that is either animatable or static.
 *
 * @param amimated - A boolean indicating whether the feature is animated.
 * @param value - The id of the {@link AnimatableValue} used to populate this value if animated, or the value {@link RawValue} if static.
 */
export type Feature = AnimatedFeature | StaticFeature;

/**
 * A compound feature in its per-axis form: one feature per component, named
 * `<feature>.<axis>` (`translation.x`, `rotation.r`, `color.g`), each a
 * number. Semio Studio writes its faces this way. An element may carry a
 * compound feature whole, per axis, or both; a component named per axis
 * stands over that component of the whole value.
 */
export type PerAxisFeatures<Name extends string, Axis extends string> = {
  [Key in `${Name}.${Axis}`]?: Feature;
};

/** The components of a translation or a scale. */
export type VectorAxis = "x" | "y" | "z";

/** The components of a rotation: roll, pitch and yaw, the euler's x, y and z. */
export type RotationAxis = "r" | "p" | "y";

/** The components of a colour. */
export type ColorAxis = "r" | "g" | "b";

/** An element's translation, rotation and scale, per axis. */
export type PerAxisTransformFeatures = PerAxisFeatures<
  "translation",
  VectorAxis
> &
  PerAxisFeatures<"rotation", RotationAxis> &
  PerAxisFeatures<"scale", VectorAxis>;
