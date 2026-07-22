import type { OutputsWithDerivatives } from "@vizij/animation";
import type { Value, Unsubscribe } from "./types";

type SubscriberMap = Map<string, Set<() => void>>;

const noop = () => {};

const makeSubKey = (playerId: number | undefined, key: string) =>
  `${playerId}|${key}`;

function addSubscriber(
  map: SubscriberMap,
  key: string,
  cb: () => void,
): Unsubscribe {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(cb);
  return () => {
    const current = map.get(key);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) {
      map.delete(key);
    }
  };
}

function notify(map: SubscriberMap, key: string) {
  const subs = map.get(key);
  if (!subs || subs.size === 0) return;
  [...subs].forEach((cb) => {
    try {
      cb();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Animation store subscriber error", err);
    }
  });
}

export type AnimationStore = {
  reset: () => void;
  applyOutputs: (out: OutputsWithDerivatives | undefined) => void;
  subscribeToKey: (key: string, cb: () => void) => Unsubscribe;
  getKeySnapshot: (key: string) => Value | undefined;
  subscribeToDerivativeKey: (key: string, cb: () => void) => Unsubscribe;
  getKeyDerivativeSnapshot: (key: string) => Value | undefined;
  subscribeToPlayerKey: (
    playerId: number,
    key: string,
    cb: () => void,
  ) => Unsubscribe;
  getPlayerKeySnapshot: (playerId: number, key: string) => Value | undefined;
  subscribeToPlayerDerivative: (
    playerId: number,
    key: string,
    cb: () => void,
  ) => Unsubscribe;
  getPlayerDerivativeSnapshot: (
    playerId: number,
    key: string,
  ) => Value | undefined;
  getValuesByPlayer: () => Record<number, Record<string, Value>>;
  getDerivativesByPlayer: () => Record<number, Record<string, Value>>;
};

export function createAnimationStore(): AnimationStore {
  let values: Record<string, Value> = {};
  let derivatives: Record<string, Value> = {};
  let valuesByPlayer: Record<number, Record<string, Value>> = {};
  let derivativesByPlayer: Record<number, Record<string, Value>> = {};

  const keySubscribers: SubscriberMap = new Map();
  const derivativeKeySubscribers: SubscriberMap = new Map();
  const playerKeySubscribers: SubscriberMap = new Map();
  const playerDerivativeSubscribers: SubscriberMap = new Map();

  return {
    reset() {
      values = {};
      derivatives = {};
      valuesByPlayer = {};
      derivativesByPlayer = {};
    },

    applyOutputs(out) {
      if (!out || !Array.isArray(out.changes) || out.changes.length === 0) {
        return;
      }

      const keyChanges = new Set<string>();
      const derivativeKeyChanges = new Set<string>();
      const playerKeyChanges: Array<{
        playerId: number | undefined;
        key: string;
      }> = [];
      const playerDerivativeChanges: Array<{
        playerId: number | undefined;
        key: string;
      }> = [];

      for (const change of out.changes) {
        const key = change.key;
        const value = (change.value ?? undefined) as Value | undefined;
        const playerId = (change.player as unknown as number) ?? undefined;

        if (value == null) {
          delete values[key];
        } else {
          values[key] = value;
        }

        if (typeof playerId !== "undefined") {
          if (!valuesByPlayer[playerId]) valuesByPlayer[playerId] = {};
          if (value == null) {
            delete valuesByPlayer[playerId][key];
          } else {
            valuesByPlayer[playerId][key] = value;
          }
        }

        if (typeof change.derivative !== "undefined") {
          const derivative = (change.derivative ?? undefined) as
            | Value
            | undefined;

          if (derivative == null) {
            delete derivatives[key];
          } else {
            derivatives[key] = derivative;
          }

          if (typeof playerId !== "undefined") {
            if (!derivativesByPlayer[playerId]) {
              derivativesByPlayer[playerId] = {};
            }
            if (derivative == null) {
              delete derivativesByPlayer[playerId][key];
            } else {
              derivativesByPlayer[playerId][key] = derivative;
            }
          }

          derivativeKeyChanges.add(key);
          playerDerivativeChanges.push({ playerId, key });
        }

        keyChanges.add(key);
        playerKeyChanges.push({ playerId, key });
      }

      keyChanges.forEach((key) => notify(keySubscribers, key));
      derivativeKeyChanges.forEach((key) =>
        notify(derivativeKeySubscribers, key),
      );
      playerKeyChanges.forEach(({ playerId, key }) =>
        notify(playerKeySubscribers, makeSubKey(playerId, key)),
      );
      playerDerivativeChanges.forEach(({ playerId, key }) =>
        notify(playerDerivativeSubscribers, makeSubKey(playerId, key)),
      );
    },

    subscribeToKey(key, cb) {
      if (!key) return noop;
      return addSubscriber(keySubscribers, key, cb);
    },

    getKeySnapshot(key) {
      return values[key];
    },

    subscribeToDerivativeKey(key, cb) {
      if (!key) return noop;
      return addSubscriber(derivativeKeySubscribers, key, cb);
    },

    getKeyDerivativeSnapshot(key) {
      return derivatives[key];
    },

    subscribeToPlayerKey(playerId, key, cb) {
      if (typeof playerId === "undefined" || !key) return noop;
      return addSubscriber(playerKeySubscribers, makeSubKey(playerId, key), cb);
    },

    getPlayerKeySnapshot(playerId, key) {
      return valuesByPlayer[playerId]?.[key];
    },

    subscribeToPlayerDerivative(playerId, key, cb) {
      if (typeof playerId === "undefined" || !key) return noop;
      return addSubscriber(
        playerDerivativeSubscribers,
        makeSubKey(playerId, key),
        cb,
      );
    },

    getPlayerDerivativeSnapshot(playerId, key) {
      return derivativesByPlayer[playerId]?.[key];
    },

    getValuesByPlayer() {
      const snapshot: Record<number, Record<string, Value>> = {};
      for (const [pid, mapping] of Object.entries(valuesByPlayer)) {
        snapshot[Number(pid)] = { ...mapping };
      }
      return snapshot;
    },

    getDerivativesByPlayer() {
      const snapshot: Record<number, Record<string, Value>> = {};
      for (const [pid, mapping] of Object.entries(derivativesByPlayer)) {
        snapshot[Number(pid)] = { ...mapping };
      }
      return snapshot;
    },
  };
}
