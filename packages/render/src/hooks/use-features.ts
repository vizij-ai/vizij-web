import { useEffect, useContext } from "react";
import { shallow } from "zustand/shallow";
import { type RawValue, type AnimatableValue, getLookup } from "utils";
import { Feature } from "../types/feature";
import { VizijContext } from "../context";

/**
 * Custom React hook to manage and subscribe to feature values.
 *
 * @param namespace - The namespace for the features.
 * @param features - A record of feature objects keyed by their IDs.
 * @param callbacks - A record of callback functions keyed by feature IDs.
 * @param debugInfo - Optional debug information to log in case of errors.
 *
 * @throws [Error] If the SceneContext store is not found.
 *
 * @returns [void]
 *
 * This hook sets up subscriptions to feature values and invokes the provided callbacks when the values change.
 * It handles both animated and non-animated features. For animated features, it subscribes to the animatable value
 * in the store and invokes the callback whenever the value changes. For non-animated features, it immediately
 * invokes the callback with the feature's value.
 */
export function useFeatures(
  namespace: string,
  features: Record<string, Feature>,
  callbacks: Record<string, (current: RawValue) => void>,
  debugInfo?: any,
) {
  const store = useContext(VizijContext);
  if (!store) throw new Error("Missing VizijProvider in the tree");

  useEffect(() => {
    const unsubsribes: (() => void)[] = [];
    Object.keys(callbacks).forEach((key) => {
      // Keys in the callbacks object that are not in the animatables object are ignored
      if (!(key in features)) {
        return;
      }

      const featureInfo = features[key];
      if (!featureInfo.animated) {
        callbacks[key](featureInfo.value);
      } else {
        const animatableValueInfo: AnimatableValue | undefined =
          store.getState().animatables[featureInfo.value];

        if (!animatableValueInfo) {
          console.error(
            `Feature with id ${key} is animated but the animated value with id ${featureInfo.value} is not found`,
            debugInfo,
          );
          return;
        }

        const cb = (value: RawValue) => {
          if (value === undefined) {
            callbacks[key](animatableValueInfo.default);
          } else {
            callbacks[key](value);
          }
        };

        const defaultValue = animatableValueInfo.default as RawValue;
        const lookupKey = getLookup(namespace, animatableValueInfo.id);
        const unsubscribe = store.subscribe(
          (state) =>
            (state.values.get(lookupKey as string) ?? defaultValue) as RawValue,
          cb,
          { equalityFn: shallow, fireImmediately: true },
        );

        unsubsribes.push(unsubscribe);
      }
    });
    return () => {
      unsubsribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [features, callbacks, store, debugInfo, namespace]);
}
