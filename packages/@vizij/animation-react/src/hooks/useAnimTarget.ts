import { useCallback, useSyncExternalStore } from "react";
import type { Value } from "../types";
import { useAnimation } from "./useAnimation";

export function useAnimTarget(key?: string): Value | undefined {
  const { subscribeToKey, getKeySnapshot } = useAnimation();

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      return subscribeToKey(key, cb);
    },
    [subscribeToKey, key],
  );

  const getSnapshot = useCallback(
    () => (key ? getKeySnapshot(key) : undefined),
    [getKeySnapshot, key],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
