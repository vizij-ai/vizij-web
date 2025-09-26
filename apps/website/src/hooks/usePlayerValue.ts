import { useCallback, useSyncExternalStore } from "react";
import type { Value } from "@vizij/animation-react";
import { useAnimation } from "@vizij/animation-react";

type PlayerKey = number | string | undefined;

type Unsubscribe = () => void;

type Listener = () => void;

export const usePlayerValue = (
  player: PlayerKey,
  key: string,
): Value | undefined => {
  const { subscribeToPlayerKey, getPlayerKeySnapshot } = useAnimation();

  const subscribe = useCallback(
    (listener: Listener): Unsubscribe => {
      if (player === undefined) {
        return () => {};
      }
      return subscribeToPlayerKey(player, key, listener);
    },
    [player, key, subscribeToPlayerKey],
  );

  const getSnapshot = useCallback(
    () =>
      player === undefined ? undefined : getPlayerKeySnapshot(player, key),
    [player, key, getPlayerKeySnapshot],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
