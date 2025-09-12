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
}> = ({ children, animations, instances, prebind, autostart = true, updateHz }) => {
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastNotifyRef = useRef<number>(0);

  // Track the identity of loaded animations to avoid redundant reloads
  const animsCacheRef = useRef<{ json: string; count: number } | null>(null);
  const animIdsRef = useRef<number[]>([]);

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
    if (!out || !Array.isArray(out.changes) || out.changes.length === 0) return;
    const changedKeys: string[] = [];
    for (const ch of out.changes) {
      valuesRef.current[ch.key] = ch.value;
      changedKeys.push(ch.key);
    }
    // Notify per-key subscribers
    changedKeys.forEach(notifyKey);
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
          eng.addInstance(pid, (aid as unknown) as number, spec.cfg);
          nextPlayers[spec.playerName] = pid as unknown as number;
        }
      } else {
        // Default: one player "default" using first animation (index 0)
        const pid = eng.createPlayer("default");
        const aid0 = animIdsRef.current[0] ?? 0;
        eng.addInstance(pid, (aid0 as unknown) as number, undefined);
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

      const eng = new Engine();
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

      // Seed a zero-step to populate any immediate outputs
      applyOutputs(eng.update(0.0));

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
  }, [autostart, updateHz, prebind]);

  // Reload if animations/instances identity changes (keep same Engine)
  useEffect(() => {
    if (!ready || !engineRef.current) return;
    const eng = engineRef.current;
    const list = normalizeAnimations(animations);
    loadAnimationsAndInstances(eng, list, instances);
    // Refresh outputs after reload
    applyOutputs(eng.update(0.0));
  }, [animations, instances, ready, loadAnimationsAndInstances]);

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

/* -----------------------------------------------------------
   Value helpers for UI
----------------------------------------------------------- */

export function valueAsNumber(v?: Value): number | undefined {
  if (!v) return undefined;
  switch (v.type) {
    case "Scalar":
      return v.data;
    case "Bool":
      return v.data ? 1 : 0;
    case "Vec2":
      return v.data[0];
    case "Vec3":
      return v.data[0];
    case "Vec4":
      return v.data[0];
    case "Color":
      return v.data[0]; // R
    case "Quat":
      return v.data[3]; // w
    case "Transform":
      return v.data.translation[0];
    case "Text":
      return Number.isFinite(Number(v.data)) ? Number(v.data) : undefined;
    default:
      return undefined;
  }
}

export function valueAsVec3(v?: Value): [number, number, number] | undefined {
  if (!v) return undefined;
  switch (v.type) {
    case "Vec3":
      return v.data;
    case "Scalar":
      return [v.data, v.data, v.data];
    case "Bool":
      return v.data ? [1, 1, 1] : [0, 0, 0];
    case "Transform":
      return v.data.translation;
    case "Color":
      return [v.data[0], v.data[1], v.data[2]];
    case "Vec2":
      return [v.data[0], v.data[1], 0];
    case "Vec4":
      return [v.data[0], v.data[1], v.data[2]];
    case "Quat":
      return [v.data[0], v.data[1], v.data[2]];
    default:
      return undefined;
  }
}

export function valueAsBool(v?: Value): boolean | undefined {
  if (!v) return undefined;
  switch (v.type) {
    case "Bool":
      return v.data;
    case "Scalar":
      return v.data !== 0;
    case "Vec2":
      return v.data[0] !== 0 || v.data[1] !== 0;
    case "Vec3":
      return v.data[0] !== 0 || v.data[1] !== 0 || v.data[2] !== 0;
    case "Vec4":
      return v.data[0] !== 0 || v.data[1] !== 0 || v.data[2] !== 0 || v.data[3] !== 0;
    case "Color":
      return v.data.some((c: number) => c !== 0);
    case "Quat":
      return !(v.data[0] === 0 && v.data[1] === 0 && v.data[2] === 0 && v.data[3] === 1);
    case "Transform":
      return (
        v.data.translation.some((x: number) => x !== 0) ||
        v.data.scale.some((x: number) => x !== 0 && x !== 1)
      );
    case "Text":
      return String(v.data).length > 0;
    default:
      return undefined;
  }
}
