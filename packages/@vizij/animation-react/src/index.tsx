import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  type Value as WasmValue,
} from "@vizij/animation-wasm";
import {
  valueAsNumber as normalizedValueAsNumber,
  valueAsNumericArray as normalizedValueAsNumericArray,
  valueAsTransform as normalizedValueAsTransform,
  type NormalizedTransform,
} from "@vizij/value-json";

export type Value = WasmValue;

/**
 * Animation React Provider (parity-oriented with @vizij/node-graph-react)
 *
 * - Initializes the WASM module and creates a single Engine instance
 * - Loads one or more StoredAnimation clips
 * - Creates player/instance mappings based on props (or a sensible default)
 * - Runs an RAF loop (optional) and applies Outputs.changes into an external store
 * - Exposes fine-grained selector hooks for per-target subscriptions
 */

/* -----------------------------------------------------------
   Context types
----------------------------------------------------------- */

type InstanceSpec = {
  playerName: string;
  /** Which animation index in `animations` array to attach; defaults to 0 */
  animIndex?: number;
  /** Optional raw InstanceCfg JSON; pass-through to engine.addInstance */
  cfg?: unknown;
};

type Ctx = {
  ready: boolean;

  /** Subscribe to changes for a given resolved target key; returns unsubscribe */
  subscribeToKey: (key: string, cb: () => void) => () => void;

  /** Snapshot accessor for latest Value of a given resolved target key */
  getKeySnapshot: (key: string) => Value | undefined;

  /** Subscribe to derivative changes for a resolved target key */
  subscribeToDerivativeKey: (key: string, cb: () => void) => () => void;

  /** Snapshot accessor for latest derivative of a given resolved target key */
  getKeyDerivativeSnapshot: (key: string) => Value | undefined;

  /** Subscribe to per-player key changes */
  subscribeToPlayerKey: (
    player: string | number,
    key: string,
    cb: () => void,
  ) => () => void;

  /** Snapshot accessor for per-player key */
  getPlayerKeySnapshot: (
    player: string | number,
    key: string,
  ) => Value | undefined;

  /** Subscribe to per-player derivative changes */
  subscribeToPlayerDerivative: (
    player: string | number,
    key: string,
    cb: () => void,
  ) => () => void;

  /** Snapshot accessor for per-player derivatives */
  getPlayerDerivativeSnapshot: (
    player: string | number,
    key: string,
  ) => Value | undefined;

  /** Get latest values grouped by player name */
  getLatestValuesByPlayer: () => Record<string, Record<string, Value>>;

  /** Get latest derivatives grouped by player name */
  getLatestDerivativesByPlayer: () => Record<string, Record<string, Value>>;

  /** Manual step; useful when autostart=false */
  step: (dt: number, inputs?: Inputs) => void;

  /** Reload animations and instances at runtime */
  reload: (
    animations: StoredAnimation[] | StoredAnimation,
    instances?: InstanceSpec[],
  ) => void;

  /** Append one or more animations without resetting existing state; returns new AnimIds (numbers) */
  addAnimations: (animations: StoredAnimation[] | StoredAnimation) => number[];

  /** Ensure a player exists with this name; returns PlayerId (number) */
  addPlayer: (name: string) => number;

  /** Add one or more instances to players; resolves animation by index or explicit id */
  addInstances: (
    specs: { playerName: string; animIndexOrId: number; cfg?: unknown }[],
  ) => { playerName: string; instId: number }[];

  /** Get instance ids for a given player (local cache; prefer listInstances for engine truth) */
  getInstances: (playerName: string) => number[];

  /** Apply instance-level updates immediately */
  updateInstances: (updates: InstanceUpdate[]) => void;

  /** Enumerate engine state (authoritative) */
  listAnimations: () => AnimationInfo[];
  listPlayers: () => PlayerInfo[];
  listInstances: (player: string | number) => InstanceInfo[];

  /** Keys currently associated with a player's instances */
  listPlayerKeys: (player: string | number) => string[];

  /** Removals */
  removePlayer: (player: string | number) => boolean;
  removeInstances: (
    specs: { playerName: string; instId: number }[],
  ) => { playerName: string; instId: number }[];
  unloadAnimations: (animIds: number[]) => number[];

  /** Baking helpers */
  bakeAnimation: (
    animIndexOrId: number,
    cfg?: BakingConfig,
  ) => BakedAnimationData | null;
  bakeAnimationWithDerivatives: (
    animIndexOrId: number,
    cfg?: BakingConfig,
  ) => BakedAnimationBundle | null;

  /** Optional: expose player name to id mapping for controls */
  players: Record<string, number>;
};

const AnimationCtx = createContext<Ctx | null>(null);

/* -----------------------------------------------------------
   Provider
----------------------------------------------------------- */

export const AnimationProvider: React.FC<{
  children: React.ReactNode;

  /** One or more StoredAnimation objects to load on mount (and when identity changes) */
  animations: StoredAnimation[] | StoredAnimation;

  /**
   * Instances to create on mount. If omitted, a single player "default" with the 0th animation is created.
   * Example: [{ playerName: "demo", animIndex: 0 }]
   */
  instances?: InstanceSpec[];

  /**
   * Optional: Prebind resolver mapping canonical target paths to keys.
   * Return string | number | null/undefined. Numbers will be coerced to string in the WASM layer.
   */
  prebind?: (path: string) => string | number | null | undefined;

  /** Start an internal RAF loop that calls engine.update(dt) each frame */
  autostart?: boolean;

  /** Throttle UI notifications (Hz). Default: notify every frame while autostarting */
  updateHz?: number;

  /** Optional engine configuration for Engine constructor. Changing this re-initializes the Engine. */
  engineConfig?: Config;

  /** Optional callback to receive raw Outputs each update (includes events and derivatives). */
  onOutputs?: (out: OutputsWithDerivatives) => void;
}> = ({
  children,
  animations,
  instances,
  prebind,
  autostart = true,
  updateHz,
  engineConfig,
  onOutputs,
}) => {
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastNotifyRef = useRef<number>(0);
  const onOutputsRef = useRef<typeof onOutputs | undefined>(onOutputs);
  useEffect(() => {
    onOutputsRef.current = onOutputs;
  }, [onOutputs]);

  // Track the identity of loaded animations to avoid redundant reloads
  const animsCacheRef = useRef<{ json: string; count: number } | null>(null);
  const animIdsRef = useRef<number[]>([]);

  // Identity keys for animations and instances to drive engine re-init on shape changes
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

  // Player registry by name for controls
  const [players, setPlayers] = useState<Record<string, number>>({});

  // External store for per-key Values
  const valuesRef = useRef<Record<string, Value>>({});
  const derivativesRef = useRef<Record<string, Value>>({});
  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());
  const derivativeSubscribersRef = useRef<Map<string, Set<() => void>>>(
    new Map(),
  );
  const valuesByPlayerRef = useRef<Record<number, Record<string, Value>>>({});
  const derivativesByPlayerRef = useRef<Record<number, Record<string, Value>>>(
    {},
  );
  const playerSubscribersRef = useRef<Map<string, Set<() => void>>>(new Map());
  const playerDerivativeSubscribersRef = useRef<Map<string, Set<() => void>>>(
    new Map(),
  );
  const instancesRef = useRef<Record<string, number[]>>({});

  const notifyKey = (key: string) => {
    const subs = subscribersRef.current.get(key);
    if (!subs || subs.size === 0) return;
    // Copy to stabilize iteration if set mutates during callbacks
    [...subs].forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Animation notify callback error", e);
      }
    });
  };

  const notifyDerivativeKey = (key: string) => {
    const subs = derivativeSubscribersRef.current.get(key);
    if (!subs || subs.size === 0) return;
    [...subs].forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Animation derivative notify callback error", e);
      }
    });
  };

  const makeSubKey = (playerId: number, key: string) => `${playerId}|${key}`;

  const notifyPlayerKey = (playerId: number, key: string) => {
    const sk = makeSubKey(playerId, key);
    const subs = playerSubscribersRef.current.get(sk);
    if (!subs || subs.size === 0) return;
    [...subs].forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Animation notify player-key callback error", e);
      }
    });
  };

  const notifyPlayerDerivativeKey = (playerId: number, key: string) => {
    const sk = makeSubKey(playerId, key);
    const subs = playerDerivativeSubscribersRef.current.get(sk);
    if (!subs || subs.size === 0) return;
    [...subs].forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Animation derivative player-key callback error", e);
      }
    });
  };

  const subscribeToKey = useCallback((key: string, cb: () => void) => {
    let set = subscribersRef.current.get(key);
    if (!set) {
      set = new Set();
      subscribersRef.current.set(key, set);
    }
    set.add(cb);
    return () => {
      const s = subscribersRef.current.get(key);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) subscribersRef.current.delete(key);
    };
  }, []);

  const getKeySnapshot = useCallback((key: string) => {
    return valuesRef.current[key];
  }, []);

  const subscribeToDerivativeKey = useCallback(
    (key: string, cb: () => void) => {
      let set = derivativeSubscribersRef.current.get(key);
      if (!set) {
        set = new Set();
        derivativeSubscribersRef.current.set(key, set);
      }
      set.add(cb);
      return () => {
        const s = derivativeSubscribersRef.current.get(key);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) derivativeSubscribersRef.current.delete(key);
      };
    },
    [],
  );

  const getKeyDerivativeSnapshot = useCallback((key: string) => {
    return derivativesRef.current[key];
  }, []);

  const applyOutputs = (out: OutputsWithDerivatives | undefined) => {
    if (!out) return;
    if (Array.isArray(out.changes) && out.changes.length > 0) {
      const changedKeys: string[] = [];
      const derivativeChangedKeys = new Set<string>();
      for (const ch of out.changes) {
        const value = (ch.value ?? undefined) as Value | undefined;
        if (value == null) {
          delete valuesRef.current[ch.key];
        } else {
          valuesRef.current[ch.key] = value;
        }

        const pid = ch.player as unknown as number;
        if (!valuesByPlayerRef.current[pid]) {
          valuesByPlayerRef.current[pid] = {};
        }
        if (value == null) {
          delete valuesByPlayerRef.current[pid][ch.key];
        } else {
          valuesByPlayerRef.current[pid][ch.key] = value;
        }

        if (!derivativesByPlayerRef.current[pid]) {
          derivativesByPlayerRef.current[pid] = {};
        }

        if (typeof ch.derivative !== "undefined") {
          const derivative = (ch.derivative ?? undefined) as Value | undefined;
          if (derivative != null) {
            derivativesRef.current[ch.key] = derivative;
            derivativesByPlayerRef.current[pid][ch.key] = derivative;
          } else {
            delete derivativesRef.current[ch.key];
            delete derivativesByPlayerRef.current[pid][ch.key];
          }
          derivativeChangedKeys.add(ch.key);
          notifyPlayerDerivativeKey(pid, ch.key);
        }

        changedKeys.push(ch.key);
        notifyPlayerKey(pid, ch.key);
      }
      // Notify per-key subscribers (legacy)
      changedKeys.forEach(notifyKey);
      derivativeChangedKeys.forEach((key) => notifyDerivativeKey(key));
    }
    // Forward full Outputs (including events) to consumer if provided
    try {
      onOutputsRef.current?.(out);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Animation onOutputs callback error", e);
    }
  };

  const normalizeAnimations = (
    anims: StoredAnimation[] | StoredAnimation,
  ): StoredAnimation[] => {
    return Array.isArray(anims) ? anims : [anims];
  };

  const resolveAnimId = useCallback(
    (animIndexOrId: number): AnimId | undefined => {
      if (Number.isInteger(animIndexOrId) && animIndexOrId >= 0) {
        const byIndex = animIdsRef.current[animIndexOrId];
        if (typeof byIndex !== "undefined") return byIndex as AnimId;
      }
      if (typeof animIndexOrId === "number") return animIndexOrId as AnimId;
      return undefined;
    },
    [],
  );

  const loadAnimationsAndInstances = useCallback(
    (eng: Engine, animList: StoredAnimation[], insts?: InstanceSpec[]) => {
      // Check if identical to previous load
      const json = JSON.stringify(animList);
      if (animsCacheRef.current && animsCacheRef.current.json === json) {
        // Same payload; only (re)create instances if needed
      } else {
        // Load animations into engine and record their returned ids
        const ids: number[] = [];
        for (const a of animList) {
          const id = eng.loadAnimation(a, { format: "stored" });
          ids.push(id as unknown as number);
        }
        animIdsRef.current = ids;
        animsCacheRef.current = { json, count: animList.length };
      }

      // Create players and instances
      const nextPlayers: Record<string, number> = {};
      if (insts && insts.length > 0) {
        for (const spec of insts) {
          const pid = eng.createPlayer(spec.playerName);
          const animIndex = spec.animIndex ?? 0;
          const aid =
            animIdsRef.current[animIndex] ?? animIdsRef.current[0] ?? 0;
          const cfgFinal = {
            weight: 1,
            time_scale: 1,
            start_offset: 0,
            enabled: true,
            ...((spec.cfg as any) ?? {}),
          };
          const iid = eng.addInstance(
            pid,
            aid as unknown as number,
            cfgFinal as any,
          ) as unknown as number;
          nextPlayers[spec.playerName] = pid as unknown as number;
          if (!instancesRef.current[spec.playerName])
            instancesRef.current[spec.playerName] = [];
          instancesRef.current[spec.playerName].push(iid);
        }
      } else {
        // Default: one player "default" using first animation (index 0)
        const pid = eng.createPlayer("default");
        const aid0 = animIdsRef.current[0] ?? 0;
        const cfgDefault = {
          weight: 1,
          time_scale: 1,
          start_offset: 0,
          enabled: true,
        };
        const iid0 = eng.addInstance(
          pid,
          aid0 as unknown as number,
          cfgDefault as any,
        ) as unknown as number;
        nextPlayers["default"] = pid as unknown as number;
        instancesRef.current["default"] = [iid0];
      }
      setPlayers(nextPlayers);
    },
    [],
  );

  // Init + construct engine + load animations + prebind + optional RAF
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await init();

      if (cancelled) return;

      // Reset value cache and internal identity caches before creating a new engine
      valuesRef.current = {};
      derivativesRef.current = {};
      animsCacheRef.current = null;
      animIdsRef.current = [];
      instancesRef.current = {};
      derivativesByPlayerRef.current = {};

      const eng = new Engine(engineConfig);
      engineRef.current = eng;

      if (prebind) {
        try {
          eng.prebind(prebind);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("Animation prebind failed", e);
        }
      }

      const list = normalizeAnimations(animations);
      loadAnimationsAndInstances(eng, list, instances);

      // Initial authoritative refresh from engine
      try {
        const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
        const nextPlayers: Record<string, number> = {};
        playersInfo.forEach(
          (pi) => (nextPlayers[pi.name] = pi.id as unknown as number),
        );
        setPlayers(nextPlayers);
        // Pre-populate instancesRef
        const temp: Record<string, number[]> = {};
        for (const pi of playersInfo) {
          const insts = eng.listInstances(
            pi.id as unknown as number,
          ) as unknown as InstanceInfo[];
          temp[pi.name] = insts.map((ii) => ii.id as unknown as number);
        }
        instancesRef.current = temp;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state refresh failed during init", e);
      }

      setReady(true);

      if (!autostart) return;

      const loop = (t: number) => {
        if (cancelled) return;

        const last = lastTimeRef.current || t;
        const dt = (t - last) / 1000; // seconds
        lastTimeRef.current = t;

        const now = performance.now();
        const interval = updateHz && updateHz > 0 ? 1000 / updateHz : 0;

        if (!interval || now - lastNotifyRef.current >= interval) {
          const out = eng.updateValuesAndDerivatives(dt);
          applyOutputs(out);
          lastNotifyRef.current = now;
        } else {
          // still advance the simulation even if throttling notifications
          eng.updateValues(dt);
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, updateHz, prebind, engineConfig, animKey, instKey]);

  // Reload effect removed: engine re-inits on animations/instances identity changes via animKey/instKey.
  // Keeping a second reload here caused duplicate players and inert transport.

  const step = useCallback((dt: number, inputs?: Inputs) => {
    const eng = engineRef.current;
    if (!eng) return;
    applyOutputs(eng.updateValuesAndDerivatives(dt, inputs));
  }, []);

  const reload = useCallback(
    (anims: StoredAnimation[] | StoredAnimation, insts?: InstanceSpec[]) => {
      const eng = engineRef.current;
      if (!eng) return;
      // Clean out existing players/instances before loading fresh animations
      try {
        const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
        for (const playerInfo of playersInfo) {
          const playerId = playerInfo.id as unknown as number;
          try {
            const instInfos = eng.listInstances(
              playerId,
            ) as unknown as InstanceInfo[];
            for (const instInfo of instInfos) {
              try {
                eng.removeInstance(playerId, instInfo.id as unknown as number);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("Failed to remove instance during reload", e);
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("Failed to enumerate instances during reload", e);
          }
          try {
            eng.removePlayer(playerId as any);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("Failed to remove player during reload", e);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state cleanup failed before reload", e);
      }

      if (animIdsRef.current.length > 0) {
        for (const animId of animIdsRef.current) {
          try {
            eng.unloadAnimation(animId as unknown as number);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("Failed to unload animation during reload", e);
          }
        }
      }

      valuesRef.current = {};
      derivativesRef.current = {};
      valuesByPlayerRef.current = {};
      derivativesByPlayerRef.current = {};
      instancesRef.current = {};
      animsCacheRef.current = null;
      animIdsRef.current = [];
      setPlayers({});

      loadAnimationsAndInstances(eng, normalizeAnimations(anims), insts);
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      // Refresh players/instances from engine after reload
      try {
        const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
        const nextPlayers: Record<string, number> = {};
        playersInfo.forEach(
          (pi) => (nextPlayers[pi.name] = pi.id as unknown as number),
        );
        setPlayers(nextPlayers);
        const temp: Record<string, number[]> = {};
        for (const pi of playersInfo) {
          const insts2 = eng.listInstances(
            pi.id as unknown as number,
          ) as unknown as InstanceInfo[];
          temp[pi.name] = insts2.map((ii) => ii.id as unknown as number);
        }
        instancesRef.current = temp;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state refresh failed after reload", e);
      }
    },
    [loadAnimationsAndInstances],
  );

  const addPlayer = useCallback(
    (name: string) => {
      const eng = engineRef.current;
      if (!eng) return -1;
      if (players[name] !== undefined) return players[name];
      const pid = eng.createPlayer(name) as unknown as number;
      setPlayers((prev) => ({ ...prev, [name]: pid }));
      if (!instancesRef.current[name]) instancesRef.current[name] = [];
      return pid;
    },
    [players],
  );

  const addAnimations = useCallback(
    (anims: StoredAnimation[] | StoredAnimation) => {
      const eng = engineRef.current;
      if (!eng) return [];
      const list = normalizeAnimations(anims);
      const newIds: number[] = [];
      for (const a of list) {
        const id = eng.loadAnimation(a, { format: "stored" });
        animIdsRef.current.push(id as unknown as number);
        newIds.push(id as unknown as number);
      }
      // Update cache snapshot (best-effort)
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
        // ignore
      }
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      // Refresh engine state
      try {
        const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
        const nextPlayers: Record<string, number> = {};
        playersInfo.forEach(
          (pi) => (nextPlayers[pi.name] = pi.id as unknown as number),
        );
        setPlayers(nextPlayers);
        const temp: Record<string, number[]> = {};
        for (const pi of playersInfo) {
          const insts2 = eng.listInstances(
            pi.id as unknown as number,
          ) as unknown as InstanceInfo[];
          temp[pi.name] = insts2.map((ii) => ii.id as unknown as number);
        }
        instancesRef.current = temp;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state refresh failed after addAnimations", e);
      }
      return newIds;
    },
    [],
  );

  const addInstances = useCallback(
    (specs: { playerName: string; animIndexOrId: number; cfg?: unknown }[]) => {
      const eng = engineRef.current;
      if (!eng || !specs || specs.length === 0) return [];
      const results: { playerName: string; instId: number }[] = [];
      const nextPlayers = { ...players };
      for (const spec of specs) {
        let pid = nextPlayers[spec.playerName];
        if (pid === undefined) {
          pid = eng.createPlayer(spec.playerName) as unknown as number;
          nextPlayers[spec.playerName] = pid;
          if (!instancesRef.current[spec.playerName])
            instancesRef.current[spec.playerName] = [];
        }
        const idx = spec.animIndexOrId;
        const aid =
          idx >= 0 && idx < animIdsRef.current.length
            ? animIdsRef.current[idx]
            : (idx as number);
        const cfgFinal = {
          weight: 1,
          time_scale: 1,
          start_offset: 0,
          enabled: true,
          ...((spec.cfg as any) ?? {}),
        };
        const instId = eng.addInstance(
          pid as any,
          aid as unknown as number,
          cfgFinal as any,
        ) as unknown as number;
        instancesRef.current[spec.playerName].push(instId);
        results.push({ playerName: spec.playerName, instId });
      }
      setPlayers(nextPlayers);
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      // Refresh engine state
      try {
        const playersInfo = eng.listPlayers() as unknown as PlayerInfo[];
        const tempPlayers: Record<string, number> = {};
        playersInfo.forEach(
          (pi) => (tempPlayers[pi.name] = pi.id as unknown as number),
        );
        setPlayers(tempPlayers);
        const temp: Record<string, number[]> = {};
        for (const pi of playersInfo) {
          const insts2 = eng.listInstances(
            pi.id as unknown as number,
          ) as unknown as InstanceInfo[];
          temp[pi.name] = insts2.map((ii) => ii.id as unknown as number);
        }
        instancesRef.current = temp;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state refresh failed after addInstances", e);
      }
      return results;
    },
    [players],
  );

  const getInstances = useCallback((playerName: string) => {
    return instancesRef.current[playerName]?.slice() ?? [];
  }, []);

  const updateInstances = useCallback((updates: InstanceUpdate[]) => {
    const eng = engineRef.current;
    if (!eng || !updates || updates.length === 0) return;
    applyOutputs(
      eng.updateValuesAndDerivatives(0.0, { instance_updates: updates }),
    );
  }, []);

  const bakeAnimation = useCallback(
    (animIndexOrId: number, cfg?: BakingConfig): BakedAnimationData | null => {
      const eng = engineRef.current;
      if (!eng) return null;
      const animId = resolveAnimId(animIndexOrId);
      if (typeof animId === "undefined") return null;
      try {
        return eng.bakeAnimation(animId as number, cfg);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Animation bakeAnimation failed", e);
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
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Animation bakeAnimationWithDerivatives failed", e);
        return null;
      }
    },
    [resolveAnimId],
  );

  const resolvePlayerId = useCallback(
    (player: string | number): number | undefined => {
      if (typeof player === "number") return player;
      return players[player];
    },
    [players],
  );

  const subscribeToPlayerKey = useCallback(
    (player: string | number, key: string, cb: () => void) => {
      const pid = resolvePlayerId(player);
      if (pid === undefined) return () => {};
      const sk = makeSubKey(pid, key);
      let set = playerSubscribersRef.current.get(sk);
      if (!set) {
        set = new Set();
        playerSubscribersRef.current.set(sk, set);
      }
      set.add(cb);
      return () => {
        const s = playerSubscribersRef.current.get(sk);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) playerSubscribersRef.current.delete(sk);
      };
    },
    [resolvePlayerId],
  );

  const subscribeToPlayerDerivative = useCallback(
    (player: string | number, key: string, cb: () => void) => {
      const pid = resolvePlayerId(player);
      if (pid === undefined) return () => {};
      const sk = makeSubKey(pid, key);
      let set = playerDerivativeSubscribersRef.current.get(sk);
      if (!set) {
        set = new Set();
        playerDerivativeSubscribersRef.current.set(sk, set);
      }
      set.add(cb);
      return () => {
        const s = playerDerivativeSubscribersRef.current.get(sk);
        if (!s) return;
        s.delete(cb);
        if (s.size === 0) playerDerivativeSubscribersRef.current.delete(sk);
      };
    },
    [resolvePlayerId],
  );

  const getPlayerKeySnapshot = useCallback(
    (player: string | number, key: string): Value | undefined => {
      const pid = resolvePlayerId(player);
      if (pid === undefined) return undefined;
      return valuesByPlayerRef.current[pid]?.[key];
    },
    [resolvePlayerId],
  );

  const getPlayerDerivativeSnapshot = useCallback(
    (player: string | number, key: string): Value | undefined => {
      const pid = resolvePlayerId(player);
      if (pid === undefined) return undefined;
      return derivativesByPlayerRef.current[pid]?.[key];
    },
    [resolvePlayerId],
  );

  const getLatestValuesByPlayer = useCallback(() => {
    // Build { playerName: { key: value } }
    const result: Record<string, Record<string, Value>> = {};
    const nameById = Object.fromEntries(
      Object.entries(players).map(([n, id]) => [String(id), n]),
    );
    for (const [idStr, kv] of Object.entries(valuesByPlayerRef.current)) {
      const name = nameById[idStr] ?? idStr;
      result[name] = { ...(kv as Record<string, Value>) };
    }
    return result;
  }, [players]);

  const getLatestDerivativesByPlayer = useCallback(() => {
    const result: Record<string, Record<string, Value>> = {};
    const nameById = Object.fromEntries(
      Object.entries(players).map(([n, id]) => [String(id), n]),
    );
    for (const [idStr, kv] of Object.entries(derivativesByPlayerRef.current)) {
      const name = nameById[idStr] ?? idStr;
      result[name] = { ...(kv as Record<string, Value>) };
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
      const pid = resolvePlayerId(player);
      if (pid === undefined) return [];
      try {
        return eng.listInstances(pid as any);
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
      const pid = resolvePlayerId(player);
      if (pid === undefined) return [];
      try {
        // @ts-ignore exposed by wasm wrapper
        return eng.listPlayerKeys(pid as any);
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
      const pid = resolvePlayerId(player);
      if (pid === undefined) return false;
      const ok = eng.removePlayer(pid as any);
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      // Refresh state
      try {
        const playersInfo = eng.listPlayers();
        const nextPlayers: Record<string, number> = {};
        playersInfo.forEach(
          (pi) => (nextPlayers[pi.name] = pi.id as unknown as number),
        );
        setPlayers(nextPlayers);
        const temp: Record<string, number[]> = {};
        for (const pi of playersInfo) {
          const insts2 = eng.listInstances(pi.id as unknown as number);
          temp[pi.name] = insts2.map((ii) => ii.id as unknown as number);
        }
        instancesRef.current = temp;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state refresh failed after removePlayer", e);
      }
      return ok;
    },
    [resolvePlayerId],
  );

  const removeInstances = useCallback(
    (specs: { playerName: string; instId: number }[]) => {
      const eng = engineRef.current;
      if (!eng || specs.length === 0) return [];
      const results: { playerName: string; instId: number }[] = [];
      for (const s of specs) {
        const pid = players[s.playerName];
        if (pid === undefined) continue;
        const ok = eng.removeInstance(
          pid as any,
          s.instId as unknown as number,
        );
        if (ok) {
          results.push({ playerName: s.playerName, instId: s.instId });
        }
      }
      applyOutputs(eng.updateValuesAndDerivatives(0.0));
      // Refresh
      try {
        const playersInfo = eng.listPlayers();
        const nextPlayers: Record<string, number> = {};
        playersInfo.forEach(
          (pi) => (nextPlayers[pi.name] = pi.id as unknown as number),
        );
        setPlayers(nextPlayers);
        const temp: Record<string, number[]> = {};
        for (const pi of playersInfo) {
          const insts2 = eng.listInstances(pi.id as unknown as number);
          temp[pi.name] = insts2.map((ii) => ii.id as unknown as number);
        }
        instancesRef.current = temp;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Engine state refresh failed after removeInstances", e);
      }
      return results;
    },
    [players],
  );

  const unloadAnimations = useCallback((animIds: number[]) => {
    const eng = engineRef.current;
    if (!eng || animIds.length === 0) return [];
    const removed: number[] = [];
    for (const aid of animIds) {
      const ok = eng.unloadAnimation(aid as unknown as number);
      if (ok) removed.push(aid);
    }
    if (removed.length > 0) {
      animIdsRef.current = animIdsRef.current.filter(
        (id) => !removed.includes(id as number),
      );
    }
    applyOutputs(eng.updateValuesAndDerivatives(0.0));
    // Refresh
    try {
      const playersInfo = eng.listPlayers();
      const nextPlayers: Record<string, number> = {};
      playersInfo.forEach(
        (pi) => (nextPlayers[pi.name] = pi.id as unknown as number),
      );
      const temp: Record<string, number[]> = {};
      for (const pi of playersInfo) {
        const insts2 = eng.listInstances(pi.id as unknown as number);
        temp[pi.name] = insts2.map((ii) => ii.id as unknown as number);
      }
      setPlayers(nextPlayers);
      instancesRef.current = temp;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Engine state refresh failed after unloadAnimations", e);
    }
    return removed;
  }, []);

  const ctx: Ctx = useMemo(
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
      players,
      listAnimations,
      listPlayers,
      listInstances,
      removePlayer,
      unloadAnimations,
      removeInstances,
      addAnimations,
      addPlayer,
      addInstances,
      updateInstances,
      getInstances,
      bakeAnimation,
      bakeAnimationWithDerivatives,
    ],
  );

  return <AnimationCtx.Provider value={ctx}>{children}</AnimationCtx.Provider>;
};

/* -----------------------------------------------------------
   Hooks
----------------------------------------------------------- */

export function useAnimation() {
  const ctx = useContext(AnimationCtx);
  if (!ctx)
    throw new Error("useAnimation must be used within AnimationProvider");
  return ctx;
}

/**
 * Subscribe to a single resolved key's Value (tagged union).
 */
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

export function valueAsNumber(v: Value | undefined): number | undefined {
  return normalizedValueAsNumber(v);
}

export function valueAsNumericArray(
  v: Value | undefined,
  fallback = 0,
): number[] | undefined {
  return normalizedValueAsNumericArray(v, fallback);
}

export function valueAsTransform(
  v: Value | undefined,
): NormalizedTransform | undefined {
  return normalizedValueAsTransform(v);
}
