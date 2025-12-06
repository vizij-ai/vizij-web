import { useCallback, useSyncExternalStore } from "react";
import { useAnimation } from "./useAnimation";
import type { Value } from "../types";

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
