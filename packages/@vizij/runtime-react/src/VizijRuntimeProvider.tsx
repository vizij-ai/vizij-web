import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  describe,
  loadVizij,
  unloadVizij,
  whenReady,
  type Runtime,
  type VizijDescription,
  type VizijOptions,
} from "@vizij/runtime";
import { canvasMounted } from "@vizij/render";
import {
  VizijChangeContext,
  VizijRuntimeContext,
  type VizijChangeSource,
  type VizijChanges,
  type VizijRuntimeContextValue,
  type VizijRuntimeStatus,
} from "./context";
import { TweenContext, createTweens } from "./tweens";

/** A face's GLB: a URL to fetch, or its bytes. */
export type VizijSource = string | URL | Blob | ArrayBuffer | Uint8Array;

export interface VizijRuntimeProviderProps {
  /** The face to show. A different source reloads the face in place. */
  glb: VizijSource;
  /** The id the face is loaded and shown under; one is derived from
   * React's `useId()` when absent. */
  vizijId?: string;
  /** `loadVizij`'s options, passed through unchanged. Read at each load: a
   * change shows from the next `glb`. */
  options?: VizijOptions;
  /** `true` (default): the device paces itself (`Runtime.run`). `false`: it
   * is stopped, and the page steps it (`runtime.step(dtMs)`). */
  run?: boolean;
  children?: ReactNode;
}

interface Loaded {
  status: VizijRuntimeStatus;
  error: Error | null;
  runtime: Runtime | null;
  description: VizijDescription | null;
}

/**
 * One face's lifecycle in React, over `@vizij/runtime`.
 *
 * It fetches the GLB, reads it with `describe`, waits for the page's canvas
 * (`<VizijCanvas>`), loads the face with `loadVizij`, and hands its children
 * the face's `Runtime` unwrapped (`useVizijRuntime`). A new `glb` reloads
 * the face under the same id: the previous scene draws until the new one is
 * ready, and the previous `Runtime` is stopped and disposed once the new one
 * exists. Unmounting stops the device, unloads the face and disposes it.
 *
 * It is the one caller of the runtime's `drainChanges`, whose cursor is one
 * per `Runtime`: once per animation frame it drains the store's changes and
 * hands the batch to every `useVizijChanges` and `useVizijValues` below it.
 * The first batch after a (re)load is the whole store.
 *
 * Showing the face is the page's `<Vizij>` slot, bound to this provider by
 * `<VizijRuntimeFace>`.
 */
export function VizijRuntimeProvider({
  glb,
  vizijId: givenId,
  options,
  run = true,
  children,
}: VizijRuntimeProviderProps): ReactNode {
  const derivedId = useId();
  const vizijId = givenId ?? derivedId;
  const [loaded, setLoaded] = useState<Loaded>({
    status: "loading",
    error: null,
    runtime: null,
    description: null,
  });
  const [behaviorError, setBehaviorError] = useState<string | undefined>();

  const latest = useRef({ glb, options });
  latest.current = { glb, options };
  /** The face's live `Runtime`: set as soon as `loadVizij` resolves. */
  const current = useRef<Runtime | null>(null);
  /** Loads and teardowns, one at a time and in order. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const listeners = useRef(new Set<(changes: VizijChanges) => void>());
  const source = useMemo<VizijChangeSource>(
    () => ({
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    [],
  );
  const tweens = useMemo(createTweens, []);

  // Unmounting, or moving to another id, takes the face down.
  useEffect(
    () => () => {
      queue.current = queue.current.then(() => {
        const runtime = current.current;
        if (!runtime) return;
        current.current = null;
        tweens.cancelAll();
        runtime.stop();
        unloadVizij(vizijId);
        runtime.dispose();
        setLoaded((previous) => ({ ...previous, runtime: null }));
      });
    },
    [vizijId, tweens],
  );

  const glbKey = glb instanceof URL ? glb.href : glb;
  useEffect(() => {
    const load = { cancelled: false };
    queue.current = queue.current.then(async () => {
      if (load.cancelled) return;
      setLoaded((previous) => ({
        ...previous,
        status: "loading",
        error: null,
      }));
      try {
        const bytes = await bytesOf(latest.current.glb);
        const description = await describe(bytes);
        if (load.cancelled) return;
        setLoaded((previous) => ({ ...previous, description }));
        await canvasMounted();
        if (load.cancelled) return;
        const next = await loadVizij(vizijId, bytes, latest.current.options);
        const previous = current.current;
        current.current = next;
        if (previous) {
          tweens.cancelAll();
          previous.stop();
          previous.dispose();
        }
        setLoaded((state) => ({ ...state, runtime: next }));
        await whenReady(vizijId);
        if (load.cancelled) return;
        setLoaded((state) => ({ ...state, status: "ready" }));
      } catch (error) {
        if (load.cancelled) return;
        setLoaded((state) => ({
          ...state,
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      }
    });
    return () => {
      load.cancelled = true;
    };
  }, [vizijId, glbKey, tweens]);

  const { runtime } = loaded;

  useEffect(() => {
    if (!runtime) return;
    if (!run) {
      runtime.stop();
      return;
    }
    if (!runtime.running) {
      runtime.run().catch((error: unknown) => {
        if (current.current !== runtime) return;
        setLoaded((state) => ({
          ...state,
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      });
    }
  }, [runtime, run]);

  // The device's standing behavior error, followed until it is disposed.
  useEffect(() => {
    if (!runtime) return;
    let following = true;
    setBehaviorError(runtime.behaviorError);
    void (async () => {
      try {
        while (following) {
          const next = await runtime.behaviorErrorChanged();
          if (following) setBehaviorError(next);
        }
      } catch {
        // The device is gone.
      }
    })();
    return () => {
      following = false;
    };
  }, [runtime]);

  // The one drain of the face's store, fanned out per animation frame.
  useEffect(() => {
    let frame = requestAnimationFrame(function drain() {
      const live = current.current;
      if (live) {
        const changes = live.drainChanges();
        if (Object.keys(changes).length > 0) {
          for (const listener of listeners.current) listener(changes);
        }
      }
      frame = requestAnimationFrame(drain);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const value = useMemo<VizijRuntimeContextValue>(
    () => ({ vizijId, behaviorError, ...loaded }),
    [vizijId, behaviorError, loaded],
  );

  return (
    <VizijRuntimeContext.Provider value={value}>
      <VizijChangeContext.Provider value={source}>
        <TweenContext.Provider value={tweens}>{children}</TweenContext.Provider>
      </VizijChangeContext.Provider>
    </VizijRuntimeContext.Provider>
  );
}

async function bytesOf(glb: VizijSource): Promise<Uint8Array> {
  if (glb instanceof Uint8Array) return glb;
  if (glb instanceof ArrayBuffer) return new Uint8Array(glb);
  if (glb instanceof Blob) return new Uint8Array(await glb.arrayBuffer());
  const response = await fetch(String(glb));
  if (!response.ok) {
    throw new Error(`Fetching ${String(glb)}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
