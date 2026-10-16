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
import { canvasMounted, setVizijProgress } from "@vizij/render";
import {
  VizijChangeContext,
  VizijRuntimeContext,
  type VizijChangeSource,
  type VizijChanges,
  type VizijRuntimeContextValue,
  type VizijRuntimeStatus,
} from "./context";
import { TweenContext, createTweens } from "./tweens";

/** How often the provider steps the device while the page is hidden, in
 * milliseconds. The browser throttles a hidden page's timers (to about once
 * a second, and less as the page stays hidden) unless it plays audio. */
const HIDDEN_STEP_MS = 10;

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
  /** `true` (default): the provider steps the device, once per animation
   * frame while the page is visible and on a timer while it is hidden.
   * `false`: the device is stopped, and the page steps it
   * (`runtime.step(dtMs)`). */
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
 * Unless `run` is `false`, it steps the device: once per animation frame
 * while the page is visible — one step per drawn frame, each by the time
 * since the previous step — and every {@link HIDDEN_STEP_MS} while it is
 * hidden, where the browser throttles timers and draws nothing. A page
 * shown again keeps that timer until its first animation frame, so the
 * device is never left unstepped between the two.
 *
 * It is the one caller of the runtime's `drainChanges`, whose cursor is one
 * per `Runtime`. While something listens (`useVizijChanges`,
 * `useVizijValues`) it drains once per animation frame and hands each batch
 * to every listener; while nothing does, it does not drain. The runtime
 * holds what is not drained as the latest value per key, so a batch is the
 * net change since the previous drain, however long ago that was. The first
 * batch after a (re)load is the whole store.
 *
 * It reports the face's stages to `@vizij/render` (`setVizijProgress`), for
 * the loading view of the face's slot: the GLB's bytes as they arrive, then
 * `loadVizij`, then the face's first frame. Unloading the face clears them.
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
      queue.current = queue.current
        .then(() => {
          const runtime = current.current;
          if (!runtime) return;
          current.current = null;
          tweens.cancelAll();
          runtime.stop();
          unloadVizij(vizijId);
          runtime.dispose();
          setLoaded((previous) => ({ ...previous, runtime: null }));
        })
        .finally(() => setVizijProgress(vizijId, null));
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
        const bytes = await bytesOf(latest.current.glb, (loaded, total) => {
          if (!load.cancelled) {
            setVizijProgress(vizijId, { stage: "fetch", loaded, total });
          }
        });
        if (load.cancelled) return;
        setVizijProgress(vizijId, { stage: "load" });
        const description = await describe(bytes);
        if (load.cancelled) return;
        setLoaded((previous) => ({ ...previous, description }));
        await canvasMounted();
        if (load.cancelled) return;
        const next = await loadVizij(vizijId, bytes, latest.current.options);
        setVizijProgress(vizijId, { stage: "draw" });
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
        const failure =
          error instanceof Error ? error : new Error(String(error));
        setVizijProgress(vizijId, { stage: "failed", error: failure });
        setLoaded((state) => ({ ...state, status: "error", error: failure }));
      }
    });
    return () => {
      load.cancelled = true;
    };
  }, [vizijId, glbKey, tweens]);

  const { runtime } = loaded;

  // The device's pace: a step per animation frame while the page is
  // visible, a timer while it is hidden.
  useEffect(() => {
    if (!runtime) return;
    runtime.stop();
    if (!run) return;
    let last = performance.now();
    let frame: number | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const fail = (error: unknown) => {
      stopPacing();
      if (current.current !== runtime) return;
      setLoaded((state) => ({
        ...state,
        status: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    };
    const step = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (dt <= 0) return;
      try {
        runtime.step(dt);
      } catch (error) {
        fail(error);
      }
    };
    const onFrame = () => {
      // The page draws again: the hidden timer has done its part.
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      step();
      frame = requestAnimationFrame(onFrame);
    };
    const follow = () => {
      if (document.visibilityState === "hidden") {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
        timer ??= setInterval(step, HIDDEN_STEP_MS);
      } else {
        frame ??= requestAnimationFrame(onFrame);
      }
    };
    function stopPacing() {
      document.removeEventListener("visibilitychange", follow);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timer !== undefined) clearInterval(timer);
      frame = undefined;
      timer = undefined;
    }
    follow();
    document.addEventListener("visibilitychange", follow);
    return stopPacing;
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

  // The one drain of the face's store, per animation frame while something
  // listens. What nobody reads stays in the runtime as one value per key.
  useEffect(() => {
    const drain = () => {
      const live = current.current;
      if (!live) return;
      const changes = live.drainChanges();
      if (Object.keys(changes).length > 0) {
        for (const listener of listeners.current) listener(changes);
      }
    };
    let frame = requestAnimationFrame(function onFrame() {
      if (listeners.current.size > 0) drain();
      frame = requestAnimationFrame(onFrame);
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

/** The GLB's bytes; a URL is fetched, with `progress` told the bytes
 * received so far and the total, `null` while it is unknown. */
async function bytesOf(
  glb: VizijSource,
  progress: (loaded: number, total: number | null) => void,
): Promise<Uint8Array> {
  if (glb instanceof Uint8Array) return glb;
  if (glb instanceof ArrayBuffer) return new Uint8Array(glb);
  if (glb instanceof Blob) return new Uint8Array(await glb.arrayBuffer());
  const response = await fetch(String(glb));
  if (!response.ok) {
    throw new Error(`Fetching ${String(glb)}: ${response.status}`);
  }
  let total = declaredLength(response);
  progress(0, total);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    progress(bytes.byteLength, total);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    // A body longer than its declared length was declared compressed.
    if (total !== null && loaded > total) total = null;
    progress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The byte count a response announces for its body: `Content-Length`,
 * unless a `Content-Encoding` says it counts the compressed bytes. */
function declaredLength(response: Response): number | null {
  const encoding = response.headers.get("Content-Encoding");
  if (encoding && encoding.toLowerCase() !== "identity") return null;
  const length = Number(response.headers.get("Content-Length") ?? NaN);
  return Number.isFinite(length) && length > 0 ? length : null;
}
