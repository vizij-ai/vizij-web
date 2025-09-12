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
  type Outputs,
  type Config,
} from "@vizij/animation-wasm";

/* Local fallback Value type to avoid tight compile-time coupling on the wasm package types.
   Matches vizij-animation-core tagged union: { type, data } */
export type Value =
  | { type: "Scalar"; data: number }
  | { type: "Vec2"; data: [number, number] }
  | { type: "Vec3"; data: [number, number, number] }
  | { type: "Vec4"; data: [number, number, number, number] }
  | { type: "Quat"; data: [number, number, number, number] }
  | { type: "Color"; data: [number, number, number, number] }
  | {
      type: "Transform";
      data: {
        translation: [number, number, number];
        rotation: [number, number, number, number];
        scale: [number, number, number];
      };
    }
  | { type: "Bool"; data: boolean }
  | { type: "Text"; data: string };

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

  /** Manual step; useful when autostart=false */
  step: (dt: number, inputs?: Inputs) => void;

  /** Reload animations and instances at runtime */
  reload: (animations: StoredAnimation[] | StoredAnimation, instances?: InstanceSpec[]) => void;

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

  /** Optional callback to receive raw Outputs each update (includes events). */
  onOutputs?: (out: Outputs) => void;
}> = ({ children, animations, instances, prebind, autostart = true, updateHz, engineConfig, onOutputs }) => {
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
      return JSON.stringify(Array.isArray(animations) ? animations : [animations]);
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
  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());

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

  const applyOutputs = (out: Outputs | undefined) => {
    if (!out) return;
    if (Array.isArray(out.changes) && out.changes.length > 0) {
      const changedKeys: string[] = [];
      for (const ch of out.changes) {
        valuesRef.current[ch.key] = ch.value;
        changedKeys.push(ch.key);
      }
      // Notify per-key subscribers
      changedKeys.forEach(notifyKey);
    }
    // Forward full Outputs (including events) to consumer if provided
    try {
      onOutputsRef.current?.(out);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Animation onOutputs callback error", e);
    }
  };

  const normalizeAnimations = (anims: StoredAnimation[] | StoredAnimation): StoredAnimation[] => {
    return Array.isArray(anims) ? anims : [anims];
  };

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
          ids.push((id as unknown) as number);
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
          const aid = animIdsRef.current[animIndex] ?? animIdsRef.current[0] ?? 0;
          const cfgFinal = {
            weight: 1,
            time_scale: 1,
            start_offset: 0,
            enabled: true,
            ...(spec.cfg as any ?? {}),
          };
          eng.addInstance(pid, (aid as unknown) as number, cfgFinal as any);
          nextPlayers[spec.playerName] = pid as unknown as number;
        }
      } else {
        // Default: one player "default" using first animation (index 0)
        const pid = eng.createPlayer("default");
        const aid0 = animIdsRef.current[0] ?? 0;
        const cfgDefault = { weight: 1, time_scale: 1, start_offset: 0, enabled: true };
        eng.addInstance(pid, (aid0 as unknown) as number, cfgDefault as any);
        nextPlayers["default"] = pid as unknown as number;
      }
      setPlayers(nextPlayers);
    },
    []
  );

  // Init + construct engine + load animations + prebind + optional RAF
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await init();

      if (cancelled) return;

      // Reset value cache and internal identity caches before creating a new engine
      valuesRef.current = {};
      animsCacheRef.current = null;
      animIdsRef.current = [];

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
          const out = eng.update(dt);
          applyOutputs(out);
          lastNotifyRef.current = now;
        } else {
          // still advance the simulation even if throttling notifications
          eng.update(dt);
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
    applyOutputs(eng.update(dt, inputs));
  }, []);

  const reload = useCallback(
    (anims: StoredAnimation[] | StoredAnimation, insts?: InstanceSpec[]) => {
      const eng = engineRef.current;
      if (!eng) return;
      loadAnimationsAndInstances(eng, normalizeAnimations(anims), insts);
      applyOutputs(eng.update(0.0));
    },
    [loadAnimationsAndInstances]
  );

  const ctx: Ctx = useMemo(
    () => ({
      ready,
      subscribeToKey,
      getKeySnapshot,
      step,
      reload,
      players,
    }),
    [ready, subscribeToKey, getKeySnapshot, step, reload, players]
  );

  return <AnimationCtx.Provider value={ctx}>{children}</AnimationCtx.Provider>;
};

/* -----------------------------------------------------------
   Hooks
----------------------------------------------------------- */

export function useAnimation() {
  const ctx = useContext(AnimationCtx);
  if (!ctx) throw new Error("useAnimation must be used within AnimationProvider");
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
    [subscribeToKey, key]
  );

  const getSnapshot = useCallback(
    () => (key ? getKeySnapshot(key) : undefined),
    [getKeySnapshot, key]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

