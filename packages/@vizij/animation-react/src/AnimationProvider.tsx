import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  init,
  Engine,
  type StoredAnimation,
  type Inputs,
  type OutputsWithDerivatives,
  type Config,
  type InstanceUpdate,
  type AnimationInfo,
  type PlayerInfo,
  type InstanceInfo,
  type AnimId,
  type BakingConfig,
  type BakedAnimationData,
  type BakedAnimationBundle,
} from "@vizij/animation-wasm";
import { AnimationContext } from "./context";
import { createAnimationStore } from "./store";
import type {
  AnimationContextValue,
  AnimationProviderProps,
  InstanceSpec,
  Value,
} from "./types";

const DEFAULT_PLAYER_NAME = "default";

const DEFAULT_INSTANCE_CFG = {
  weight: 1,
  time_scale: 1,
  start_offset: 0,
  enabled: true,
} as const;

function normalizeAnimations(
  animations: StoredAnimation[] | StoredAnimation,
): StoredAnimation[] {
  return Array.isArray(animations) ? animations : [animations];
}

export function AnimationProvider({
  children,
  animations,
  instances,
  prebind,
  autostart = true,
  updateHz,
  engineConfig,
  onOutputs,
}: AnimationProviderProps) {
  const engineRef = useRef<Engine | null>(null);
  const storeRef = useRef(createAnimationStore());
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastNotifyRef = useRef<number>(0);
  const onOutputsRef = useRef<typeof onOutputs | undefined>(onOutputs);
  const animsCacheRef = useRef<{ json: string; count: number } | null>(null);
  const animIdsRef = useRef<number[]>([]);
  const instancesRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    onOutputsRef.current = onOutputs;
  }, [onOutputs]);

  const animKey = useMemo(() => {
    try {
      return JSON.stringify(
        Array.isArray(animations) ? animations : [animations],
      );
    } catch {
      return String(Math.random());
    }
  }, [animations]);

  const instKey = useMemo(() => {
    try {
      return JSON.stringify(instances ?? []);
    } catch {
      return String(Math.random());
    }
  }, [instances]);

  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState<Record<string, number>>({});

  const applyOutputs = useCallback(
    (out: OutputsWithDerivatives | undefined) => {
      storeRef.current.applyOutputs(out);
      if (!out) return;
      try {
        onOutputsRef.current?.(out);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Animation onOutputs callback error", err);
      }
    },
    [],
  );

  const refreshPlayersAndInstances = useCallback((eng: Engine) => {
    try {
      const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
      const nextPlayers: Record<string, number> = {};
      const nextInstances: Record<string, number[]> = {};
      for (const info of playersInfo) {
        const playerId = info.id as unknown as number;
        nextPlayers[info.name] = playerId;
        try {
          const instInfos = eng.listInstances(
            playerId,
          ) as unknown as InstanceInfo[];
          nextInstances[info.name] = instInfos.map(
            (inst) => inst.id as unknown as number,
          );
        } catch {
          nextInstances[info.name] = [];
        }
      }
      setPlayers(nextPlayers);
      instancesRef.current = nextInstances;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Animation refreshPlayersAndInstances failed", err);
    }
  }, []);

  const resolveAnimId = useCallback(
    (animIndexOrId: number): AnimId | undefined => {
      if (Number.isInteger(animIndexOrId) && animIndexOrId >= 0) {
        const byIndex = animIdsRef.current[animIndexOrId];
        if (typeof byIndex !== "undefined") {
          return byIndex as AnimId;
        }
      }
      if (typeof animIndexOrId === "number") {
        return animIndexOrId as AnimId;
      }
      return undefined;
    },
    [],
  );

  const loadAnimationsAndInstances = useCallback(
    (eng: Engine, animList: StoredAnimation[], instSpecs?: InstanceSpec[]) => {
      const serialized = JSON.stringify(animList);
      if (!animsCacheRef.current || animsCacheRef.current.json !== serialized) {
        const ids: number[] = [];
        for (const anim of animList) {
          const id = eng.loadAnimation(anim, { format: "stored" });
          ids.push(id as unknown as number);
        }
        animIdsRef.current = ids;
        animsCacheRef.current = { json: serialized, count: animList.length };
      }

      instancesRef.current = {};

      if (instSpecs && instSpecs.length > 0) {
        for (const spec of instSpecs) {
          const playerId = eng.createPlayer(spec.playerName);
          const animIndex = spec.animIndex ?? 0;
          const animId =
            animIdsRef.current[animIndex] ?? animIdsRef.current[0] ?? 0;
          const cfgFinal = {
            ...DEFAULT_INSTANCE_CFG,
            ...(spec.cfg as Record<string, unknown> | undefined),
          };
          const instId = eng.addInstance(
            playerId,
            animId as unknown as number,
            cfgFinal as any,
          ) as unknown as number;
          if (!instancesRef.current[spec.playerName]) {
            instancesRef.current[spec.playerName] = [];
          }
          instancesRef.current[spec.playerName].push(instId);
        }
      } else {
        const playerId = eng.createPlayer(DEFAULT_PLAYER_NAME);
        const animId = animIdsRef.current[0] ?? 0;
        const instId = eng.addInstance(
          playerId,
          animId as unknown as number,
          { ...DEFAULT_INSTANCE_CFG } as any,
        ) as unknown as number;
        instancesRef.current[DEFAULT_PLAYER_NAME] = [instId];
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await init();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to init @vizij/animation-wasm", err);
        return;
      }

      if (cancelled) return;

      const store = storeRef.current;
      store.reset();
      animsCacheRef.current = null;
      animIdsRef.current = [];
      instancesRef.current = {};
      lastTimeRef.current = 0;
      lastNotifyRef.current = 0;

      const engine = new Engine(engineConfig);
      engineRef.current = engine;

      if (prebind) {
        try {
          engine.prebind(prebind);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Animation prebind failed", err);
        }
      }

      const list = normalizeAnimations(animations);
      loadAnimationsAndInstances(engine, list, instances);
      if (autostart) {
        applyOutputs(engine.updateValuesAndDerivatives(0.0));
      }
      refreshPlayersAndInstances(engine);

      setReady(true);

      if (!autostart) return;

      const loop = (time: number) => {
        if (cancelled) return;
        const eng = engineRef.current;
        if (!eng) return;

        const last = lastTimeRef.current || time;
        const dt = (time - last) / 1000;
        lastTimeRef.current = time;

        const now = performance.now();
        const interval = updateHz && updateHz > 0 ? 1000 / updateHz : 0;

        if (!interval || now - lastNotifyRef.current >= interval) {
          const out = eng.updateValuesAndDerivatives(dt);
          applyOutputs(out);
          lastNotifyRef.current = now;
        } else {
          eng.updateValues(dt);
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, updateHz, prebind, engineConfig, animKey, instKey]);

  const resolvePlayerId = useCallback(
    (player: string | number): number | undefined => {
      if (typeof player === "number") return player;
      return players[player];
    },
    [players],
  );

  const step = useCallback(
    (dt: number, inputs?: Inputs) => {
      const eng = engineRef.current;
      if (!eng) return;
      applyOutputs(eng.updateValuesAndDerivatives(dt, inputs));
    },
    [applyOutputs],
  );

  const reload = useCallback(
    (
      animPayload: StoredAnimation[] | StoredAnimation,
      instSpecs?: InstanceSpec[],
    ) => {
      const eng = engineRef.current;
      if (!eng) return;

      try {
        const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
        for (const playerInfo of playersInfo) {
          const playerId = playerInfo.id as unknown as number;
          try {
            const instInfos = eng.listInstances(
              playerId,
            ) as unknown as InstanceInfo[];
            for (const inst of instInfos) {
              try {
                eng.removeInstance(playerId, inst.id as unknown as number);
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn("Failed to remove instance during reload", err);
              }
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("Failed to enumerate instances during reload", err);
          }
          try {
            eng.removePlayer(playerId as any);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("Failed to remove player during reload", err);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Engine state cleanup failed before reload", err);
      }

      if (animIdsRef.current.length > 0) {
        for (const animId of animIdsRef.current) {
          try {
            eng.unloadAnimation(animId as unknown as number);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("Failed to unload animation during reload", err);
          }
        }
      }

      storeRef.current.reset();
      animsCacheRef.current = null;
      animIdsRef.current = [];
      instancesRef.current = {};
      setPlayers({});

      const list = normalizeAnimations(animPayload);
      loadAnimationsAndInstances(eng, list, instSpecs);
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      refreshPlayersAndInstances(eng);
    },
    [applyOutputs, loadAnimationsAndInstances, refreshPlayersAndInstances],
  );

  const addPlayer = useCallback(
    (name: string) => {
      const eng = engineRef.current;
      if (!eng) return -1;
      if (typeof players[name] !== "undefined") return players[name];
      const playerId = eng.createPlayer(name) as unknown as number;
      setPlayers((prev) => ({ ...prev, [name]: playerId }));
      if (!instancesRef.current[name]) instancesRef.current[name] = [];
      return playerId;
    },
    [players],
  );

  const addAnimations = useCallback(
    (anims: StoredAnimation[] | StoredAnimation) => {
      const eng = engineRef.current;
      if (!eng) return [];
      const list = normalizeAnimations(anims);
      const newIds: number[] = [];
      for (const anim of list) {
        const id = eng.loadAnimation(anim, { format: "stored" });
        animIdsRef.current.push(id as unknown as number);
        newIds.push(id as unknown as number);
      }
      try {
        const prev = animsCacheRef.current
          ? JSON.parse(animsCacheRef.current.json)
          : [];
        const merged = [...prev, ...list];
        animsCacheRef.current = {
          json: JSON.stringify(merged),
          count: merged.length,
        };
      } catch {
        // ignore cache parsing errors
      }
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      refreshPlayersAndInstances(eng);
      return newIds;
    },
    [applyOutputs, refreshPlayersAndInstances],
  );

  const addInstances = useCallback(
    (specs: { playerName: string; animIndexOrId: number; cfg?: unknown }[]) => {
      const eng = engineRef.current;
      if (!eng || !specs || specs.length === 0) return [];
      const results: { playerName: string; instId: number }[] = [];
      const nextPlayers = { ...players };
      for (const spec of specs) {
        let playerId = nextPlayers[spec.playerName];
        if (typeof playerId === "undefined") {
          playerId = eng.createPlayer(spec.playerName) as unknown as number;
          nextPlayers[spec.playerName] = playerId;
          if (!instancesRef.current[spec.playerName]) {
            instancesRef.current[spec.playerName] = [];
          }
        }
        const idx = spec.animIndexOrId;
        const animId =
          idx >= 0 && idx < animIdsRef.current.length
            ? animIdsRef.current[idx]
            : (idx as number);
        const cfgFinal = {
          ...DEFAULT_INSTANCE_CFG,
          ...(spec.cfg as Record<string, unknown> | undefined),
        };
        const instId = eng.addInstance(
          playerId as any,
          animId as unknown as number,
          cfgFinal as any,
        ) as unknown as number;
        instancesRef.current[spec.playerName].push(instId);
        results.push({ playerName: spec.playerName, instId });
      }
      setPlayers(nextPlayers);
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      refreshPlayersAndInstances(eng);
      return results;
    },
    [applyOutputs, players, refreshPlayersAndInstances],
  );

  const getInstances = useCallback((playerName: string) => {
    return instancesRef.current[playerName]?.slice() ?? [];
  }, []);

  const updateInstances = useCallback(
    (updates: InstanceUpdate[]) => {
      const eng = engineRef.current;
      if (!eng || !updates || updates.length === 0) return;
      applyOutputs(
        eng.updateValuesAndDerivatives(0.0, { instance_updates: updates }),
      );
    },
    [applyOutputs],
  );

  const bakeAnimation = useCallback(
    (animIndexOrId: number, cfg?: BakingConfig): BakedAnimationData | null => {
      const eng = engineRef.current;
      if (!eng) return null;
      const animId = resolveAnimId(animIndexOrId);
      if (typeof animId === "undefined") return null;
      try {
        return eng.bakeAnimation(animId as number, cfg);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Animation bakeAnimation failed", err);
        return null;
      }
    },
    [resolveAnimId],
  );

  const bakeAnimationWithDerivatives = useCallback(
    (
      animIndexOrId: number,
      cfg?: BakingConfig,
    ): BakedAnimationBundle | null => {
      const eng = engineRef.current;
      if (!eng) return null;
      const animId = resolveAnimId(animIndexOrId);
      if (typeof animId === "undefined") return null;
      try {
        return eng.bakeAnimationWithDerivatives(animId as number, cfg);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Animation bakeAnimationWithDerivatives failed", err);
        return null;
      }
    },
    [resolveAnimId],
  );

  const subscribeToKey = useCallback((key: string, cb: () => void) => {
    return storeRef.current.subscribeToKey(key, cb);
  }, []);

  const getKeySnapshot = useCallback((key: string) => {
    return storeRef.current.getKeySnapshot(key);
  }, []);

  const subscribeToDerivativeKey = useCallback(
    (key: string, cb: () => void) => {
      return storeRef.current.subscribeToDerivativeKey(key, cb);
    },
    [],
  );

  const getKeyDerivativeSnapshot = useCallback((key: string) => {
    return storeRef.current.getKeyDerivativeSnapshot(key);
  }, []);

  const subscribeToPlayerKey = useCallback(
    (player: string | number, key: string, cb: () => void) => {
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return () => {};
      return storeRef.current.subscribeToPlayerKey(playerId, key, cb);
    },
    [resolvePlayerId],
  );

  const getPlayerKeySnapshot = useCallback(
    (player: string | number, key: string): Value | undefined => {
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return undefined;
      return storeRef.current.getPlayerKeySnapshot(playerId, key);
    },
    [resolvePlayerId],
  );

  const subscribeToPlayerDerivative = useCallback(
    (player: string | number, key: string, cb: () => void) => {
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return () => {};
      return storeRef.current.subscribeToPlayerDerivative(playerId, key, cb);
    },
    [resolvePlayerId],
  );

  const getPlayerDerivativeSnapshot = useCallback(
    (player: string | number, key: string): Value | undefined => {
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return undefined;
      return storeRef.current.getPlayerDerivativeSnapshot(playerId, key);
    },
    [resolvePlayerId],
  );

  const getLatestValuesByPlayer = useCallback(() => {
    const snapshot = storeRef.current.getValuesByPlayer();
    const result: Record<string, Record<string, Value>> = {};
    const nameById = Object.fromEntries(
      Object.entries(players).map(([name, id]) => [String(id), name]),
    );
    for (const [idStr, valuesForPlayer] of Object.entries(snapshot)) {
      const canonicalName = nameById[idStr] ?? idStr;
      result[canonicalName] = { ...(valuesForPlayer as Record<string, Value>) };
    }
    return result;
  }, [players]);

  const getLatestDerivativesByPlayer = useCallback(() => {
    const snapshot = storeRef.current.getDerivativesByPlayer();
    const result: Record<string, Record<string, Value>> = {};
    const nameById = Object.fromEntries(
      Object.entries(players).map(([name, id]) => [String(id), name]),
    );
    for (const [idStr, valuesForPlayer] of Object.entries(snapshot)) {
      const canonicalName = nameById[idStr] ?? idStr;
      result[canonicalName] = { ...(valuesForPlayer as Record<string, Value>) };
    }
    return result;
  }, [players]);

  const listAnimations = useCallback((): AnimationInfo[] => {
    const eng = engineRef.current;
    if (!eng) return [];
    try {
      return eng.listAnimations();
    } catch {
      return [];
    }
  }, []);

  const listPlayers = useCallback((): PlayerInfo[] => {
    const eng = engineRef.current;
    if (!eng) return [];
    try {
      return eng.listPlayers();
    } catch {
      return [];
    }
  }, []);

  const listInstances = useCallback(
    (player: string | number): InstanceInfo[] => {
      const eng = engineRef.current;
      if (!eng) return [];
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return [];
      try {
        return eng.listInstances(playerId as any);
      } catch {
        return [];
      }
    },
    [resolvePlayerId],
  );

  const listPlayerKeys = useCallback(
    (player: string | number): string[] => {
      const eng = engineRef.current;
      if (!eng) return [];
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return [];
      try {
        // @ts-ignore wasm binding provides listPlayerKeys
        return eng.listPlayerKeys(playerId as any);
      } catch {
        return [];
      }
    },
    [resolvePlayerId],
  );

  const removePlayer = useCallback(
    (player: string | number): boolean => {
      const eng = engineRef.current;
      if (!eng) return false;
      const playerId = resolvePlayerId(player);
      if (typeof playerId === "undefined") return false;
      const ok = eng.removePlayer(playerId as any);
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      refreshPlayersAndInstances(eng);
      return ok;
    },
    [applyOutputs, refreshPlayersAndInstances, resolvePlayerId],
  );

  const removeInstances = useCallback(
    (specs: { playerName: string; instId: number }[]) => {
      const eng = engineRef.current;
      if (!eng || specs.length === 0) return [];
      const removed: { playerName: string; instId: number }[] = [];
      for (const spec of specs) {
        const playerId = resolvePlayerId(spec.playerName);
        if (typeof playerId === "undefined") continue;
        try {
          const ok = eng.removeInstance(playerId as any, spec.instId as any);
          if (ok) removed.push(spec);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Failed to remove instance", err);
        }
      }
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      refreshPlayersAndInstances(eng);
      return removed;
    },
    [applyOutputs, refreshPlayersAndInstances, resolvePlayerId],
  );

  const unloadAnimations = useCallback(
    (animIds: number[]) => {
      const eng = engineRef.current;
      if (!eng || animIds.length === 0) return [];
      const removed: number[] = [];
      for (const animId of animIds) {
        const ok = eng.unloadAnimation(animId as unknown as number);
        if (ok) removed.push(animId);
      }
      if (removed.length > 0) {
        animIdsRef.current = animIdsRef.current.filter(
          (id) => !removed.includes(id as number),
        );
      }
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      refreshPlayersAndInstances(eng);
      return removed;
    },
    [applyOutputs, refreshPlayersAndInstances],
  );

  const contextValue = useMemo<AnimationContextValue>(
    () => ({
      ready,
      subscribeToKey,
      getKeySnapshot,
      subscribeToDerivativeKey,
      getKeyDerivativeSnapshot,
      subscribeToPlayerKey,
      getPlayerKeySnapshot,
      subscribeToPlayerDerivative,
      getPlayerDerivativeSnapshot,
      getLatestValuesByPlayer,
      getLatestDerivativesByPlayer,
      step,
      reload,
      addAnimations,
      addPlayer,
      addInstances,
      getInstances,
      updateInstances,
      listAnimations,
      listPlayers,
      listInstances,
      listPlayerKeys,
      removePlayer,
      removeInstances,
      unloadAnimations,
      bakeAnimation,
      bakeAnimationWithDerivatives,
      players,
    }),
    [
      ready,
      subscribeToKey,
      getKeySnapshot,
      subscribeToDerivativeKey,
      getKeyDerivativeSnapshot,
      subscribeToPlayerKey,
      getPlayerKeySnapshot,
      subscribeToPlayerDerivative,
      getPlayerDerivativeSnapshot,
      getLatestValuesByPlayer,
      getLatestDerivativesByPlayer,
      step,
      reload,
      addAnimations,
      addPlayer,
      addInstances,
      getInstances,
      updateInstances,
      listAnimations,
      listPlayers,
      listInstances,
      listPlayerKeys,
      removePlayer,
      removeInstances,
      unloadAnimations,
      bakeAnimation,
      bakeAnimationWithDerivatives,
      players,
    ],
  );

  return (
    <AnimationContext.Provider value={contextValue}>
      {children}
    </AnimationContext.Provider>
  );
}
