import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  init as initOrchestratorWasm,
  createOrchestrator as createOrchestratorWasm,
  type Orchestrator as OrchestratorRuntime,
} from "@vizij/orchestrator-wasm";
import { OrchestratorContext } from "./context";
import type {
  ControllerId,
  CreateOrchOptions,
  GraphRegistrationInput,
  AnimationRegistrationConfig,
  InitInput,
  OrchestratorFrame,
  OrchestratorReactCtx,
  PrebindResolver,
  ShapeJSON,
  ValueJSON,
} from "./types";

function normalizeInitInput(
  input?: InitInput,
): string | URL | Uint8Array | undefined {
  if (input == null) {
    return undefined;
  }
  if (typeof input === "string") {
    return input;
  }
  if (typeof Uint8Array !== "undefined" && input instanceof Uint8Array) {
    return input;
  }
  if (typeof URL !== "undefined" && input instanceof URL) {
    return input;
  }
  if (
    typeof input === "object" &&
    "url" in input &&
    typeof (input as { url?: unknown }).url === "string"
  ) {
    return (input as { url?: string }).url;
  }
  return undefined;
}

export type OrchestratorProviderProps = {
  children: React.ReactNode;
  /** Optional init() input forwarded to the wasm layer. */
  initInput?: InitInput;
  /** Automatically create a runtime orchestration instance on mount. Defaults to true. */
  autoCreate?: boolean;
  /** Options passed to the wasm createOrchestrator helper when auto-creating. */
  createOptions?: CreateOrchOptions;
  /**
   * Start a requestAnimationFrame loop once ready. Defaults to false so tests and
   * demos can opt-in to manual stepping.
   */
  autostart?: boolean;
};

const noopUnsubscribe = () => {
  /* no-op */
};

export function OrchestratorProvider({
  children,
  initInput,
  autoCreate = true,
  createOptions,
  autostart = false,
}: OrchestratorProviderProps): JSX.Element {
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const initPromiseRef = useRef<Promise<void> | null>(null);
  const orchestratorRef = useRef<OrchestratorRuntime | null>(null);
  const createPromiseRef = useRef<Promise<OrchestratorRuntime> | null>(null);

  const latestFrameRef = useRef<OrchestratorFrame | null>(null);
  const pathCacheRef = useRef(new Map<string, ValueJSON>());
  const pathSubscribersRef = useRef(new Map<string, Set<() => void>>());
  const frameSubscribersRef = useRef(new Set<() => void>());

  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  const ensureInit = useCallback((): Promise<void> => {
    if (!initPromiseRef.current) {
      const resolved = normalizeInitInput(initInput);
      initPromiseRef.current = initOrchestratorWasm(resolved).catch((err) => {
        setInitError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      });
    }
    return initPromiseRef.current;
  }, [initInput]);

  const applyFrame = useCallback((frame: OrchestratorFrame | null) => {
    latestFrameRef.current = frame;

    if (frame) {
      const cache = pathCacheRef.current;
      const subscribers = pathSubscribersRef.current;

      for (const write of frame.merged_writes) {
        cache.set(write.path, write.value);
        const listeners = subscribers.get(write.path);
        if (listeners) {
          listeners.forEach((listener) => listener());
        }
      }
    }

    frameSubscribersRef.current.forEach((listener) => listener());
  }, []);

  const ensureOrchestrator = useCallback(
    async (opts?: CreateOrchOptions): Promise<OrchestratorRuntime> => {
      if (orchestratorRef.current) {
        return orchestratorRef.current;
      }
      if (!createPromiseRef.current) {
        createPromiseRef.current = (async () => {
          await ensureInit();
          const instance = await createOrchestratorWasm(
            opts ?? createOptions ?? undefined,
          );
          orchestratorRef.current = instance;
          if (mountedRef.current) {
            setReady(true);
          }
          return instance;
        })();
      }
      return createPromiseRef.current;
    },
    [createOptions, ensureInit],
  );

  const requireOrchestrator = useCallback((): OrchestratorRuntime => {
    const instance = orchestratorRef.current;
    if (!instance) {
      throw new Error(
        "Orchestrator not created yet. Call createOrchestrator() first.",
      );
    }
    return instance;
  }, []);

  const stepRuntime = useCallback(
    (dt: number): OrchestratorFrame | null => {
      if (!Number.isFinite(dt)) {
        throw new Error("step(dt) requires a finite number of seconds.");
      }
      const instance = orchestratorRef.current;
      if (!instance) {
        return null;
      }
      const frame = instance.step(dt) as OrchestratorFrame | undefined;
      if (frame) {
        applyFrame(frame);
        return frame;
      }
      return null;
    },
    [applyFrame],
  );

  const createOrchestratorFn = useCallback(
    async (opts?: CreateOrchOptions) => {
      await ensureOrchestrator(opts);
    },
    [ensureOrchestrator],
  );

  const registerGraph = useCallback(
    (cfg: GraphRegistrationInput): ControllerId => {
      const instance = requireOrchestrator();
      return instance.registerGraph(cfg);
    },
    [requireOrchestrator],
  );

  const registerAnimation = useCallback(
    (cfg: AnimationRegistrationConfig): ControllerId => {
      const instance = requireOrchestrator();
      return instance.registerAnimation(cfg);
    },
    [requireOrchestrator],
  );

  const prebind = useCallback(
    (resolver: PrebindResolver) => {
      const instance = requireOrchestrator();
      instance.prebind(resolver);
    },
    [requireOrchestrator],
  );

  const setInput = useCallback(
    (path: string, value: ValueJSON, shape?: ShapeJSON) => {
      if (typeof path !== "string" || path.length === 0) {
        throw new Error("setInput requires a non-empty string path.");
      }
      const instance = requireOrchestrator();
      instance.setInput(path, value as ValueJSON, shape);
    },
    [requireOrchestrator],
  );

  const removeInput = useCallback(
    (path: string): boolean => {
      if (typeof path !== "string" || path.length === 0) {
        throw new Error("removeInput requires a non-empty string path.");
      }
      const instance = requireOrchestrator();
      const removed = instance.removeInput(path);
      if (removed) {
        pathCacheRef.current.delete(path);
        const listeners = pathSubscribersRef.current.get(path);
        if (listeners) {
          listeners.forEach((listener) => listener());
        }
      }
      return removed;
    },
    [requireOrchestrator],
  );

  const listControllers = useCallback(() => {
    const instance = orchestratorRef.current;
    if (!instance) {
      return { graphs: [] as ControllerId[], anims: [] as ControllerId[] };
    }
    const result = instance.listControllers() as
      | { graphs?: ControllerId[]; anims?: ControllerId[] }
      | undefined
      | null;
    const graphs = Array.isArray(result?.graphs)
      ? (result?.graphs as ControllerId[])
      : [];
    const anims = Array.isArray(result?.anims)
      ? (result?.anims as ControllerId[])
      : [];
    return { graphs, anims };
  }, []);

  const removeGraph = useCallback(
    (id: ControllerId): boolean => {
      const instance = requireOrchestrator();
      return instance.removeGraph(id);
    },
    [requireOrchestrator],
  );

  const removeAnimation = useCallback(
    (id: ControllerId): boolean => {
      const instance = requireOrchestrator();
      return instance.removeAnimation(id);
    },
    [requireOrchestrator],
  );

  const getLatestFrame = useCallback(() => latestFrameRef.current, []);
  const getFrameSnapshot = useCallback(() => latestFrameRef.current, []);

  const subscribeToFrame = useCallback((cb: () => void) => {
    const listeners = frameSubscribersRef.current;
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const getPathSnapshot = useCallback(
    (path: string) => pathCacheRef.current.get(path),
    [],
  );

  const subscribeToPath = useCallback((path: string, cb: () => void) => {
    if (!path) {
      return noopUnsubscribe;
    }
    let listeners = pathSubscribersRef.current.get(path);
    if (!listeners) {
      listeners = new Set();
      pathSubscribersRef.current.set(path, listeners);
    }
    listeners.add(cb);
    return () => {
      const current = pathSubscribersRef.current.get(path);
      if (!current) return;
      current.delete(cb);
      if (current.size === 0) {
        pathSubscribersRef.current.delete(path);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureInit().catch((err) => {
      if (!cancelled) {
        console.error("@vizij/orchestrator-react: failed to init wasm", err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ensureInit]);

  useEffect(() => {
    if (!autoCreate) {
      return;
    }
    let cancelled = false;
    ensureOrchestrator()
      .catch((err) => {
        if (!cancelled) {
          console.error(
            "@vizij/orchestrator-react: failed to create orchestrator",
            err,
          );
        }
      })
      .finally(() => {
        if (
          !cancelled &&
          mountedRef.current &&
          autoCreate &&
          orchestratorRef.current
        ) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [autoCreate, ensureOrchestrator]);

  useEffect(() => {
    if (!autostart || !ready) {
      return;
    }
    const globalObj: typeof globalThis & {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (id: number) => void;
    } = typeof globalThis !== "undefined" ? globalThis : ({} as any);

    const request = globalObj.requestAnimationFrame?.bind(globalObj);
    const cancel = globalObj.cancelAnimationFrame?.bind(globalObj);

    if (!request || !cancel) {
      console.warn(
        "@vizij/orchestrator-react: autostart is enabled but requestAnimationFrame is unavailable.",
      );
      return;
    }

    let rafId: number | null = null;
    let lastTs = 0;

    const loop = (timestamp: number) => {
      if (!mountedRef.current) {
        return;
      }
      if (lastTs === 0) {
        lastTs = timestamp;
      }
      const dt = Math.max(0, (timestamp - lastTs) / 1000);
      lastTs = timestamp;
      stepRuntime(dt || 0);
      rafId = request(loop);
    };

    rafId = request(loop);
    return () => {
      if (rafId !== null) {
        cancel(rafId);
      }
    };
  }, [autostart, ready, stepRuntime]);

  useEffect(() => {
    if (initError) {
      console.error("@vizij/orchestrator-react: init error", initError);
    }
  }, [initError]);

  const contextValue = useMemo<OrchestratorReactCtx>(
    () => ({
      ready,
      createOrchestrator: createOrchestratorFn,
      registerGraph,
      registerAnimation,
      prebind,
      setInput,
      removeInput,
      step: stepRuntime,
      listControllers,
      removeGraph,
      removeAnimation,
      getLatestFrame,
      subscribeToPath,
      getPathSnapshot,
      subscribeToFrame,
      getFrameSnapshot,
    }),
    [
      ready,
      createOrchestratorFn,
      registerGraph,
      registerAnimation,
      prebind,
      setInput,
      removeInput,
      stepRuntime,
      listControllers,
      removeGraph,
      removeAnimation,
      getLatestFrame,
      subscribeToPath,
      getPathSnapshot,
      subscribeToFrame,
      getFrameSnapshot,
    ],
  );

  return (
    <OrchestratorContext.Provider value={contextValue}>
      {children}
    </OrchestratorContext.Provider>
  );
}
