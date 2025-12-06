import { useCallback, useSyncExternalStore } from "react";
import { useAnimation } from "./useAnimation";
import type { Value } from "../types";

export function useAnimDerivative(key?: string): Value | undefined {
  const { subscribeToDerivativeKey, getKeyDerivativeSnapshot } = useAnimation();

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      return subscribeToDerivativeKey(key, cb);
    },
    [subscribeToDerivativeKey, key],
  );

  const getSnapshot = useCallback(
    () => (key ? getKeyDerivativeSnapshot(key) : undefined),
    [getKeyDerivativeSnapshot, key],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
