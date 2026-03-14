import { useCallback, useEffect, useRef, useState } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";

export type OrchestratorBootstrapState = {
  ready: boolean;
  initializing: boolean;
  error: string | null;
};

const DEFAULT_STATE: OrchestratorBootstrapState = {
  ready: false,
  initializing: false,
  error: null,
};

/**
 * Exposes a controlled bootstrap flow for the orchestrator runtime.
 * Consumers decide when to call {@link start} which in turn invokes
 * {@link createOrchestrator}. The hook still mirrors the ambient `ready`
 * flag so downstream hooks behave the same once started.
 */
export function useOrchestratorBootstrap(): OrchestratorBootstrapState & {
  start: () => void;
} {
  const { ready: orchestratorReady, createOrchestrator } = useOrchestrator();
  const [state, setState] = useState<OrchestratorBootstrapState>(DEFAULT_STATE);
  const pendingRef = useRef(false);

  useEffect(() => {
    setState((prev) => {
      if (orchestratorReady) {
        if (prev.ready && !prev.initializing && prev.error === null) {
          return prev;
        }
        return { ready: true, initializing: false, error: null };
      }
      if (!pendingRef.current && prev.ready) {
        return { ...prev, ready: false };
      }
      return prev;
    });
  }, [orchestratorReady]);

  const start = useCallback(() => {
    if (orchestratorReady || pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setState({ ready: false, initializing: true, error: null });

    createOrchestrator({ schedule: "SinglePass" })
      .then(() => {
        setState({ ready: true, initializing: false, error: null });
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Failed to create orchestrator.";
        console.error("demo-animating-faces: orchestrator init failed", err);
        setState({ ready: false, initializing: false, error: message });
      })
      .finally(() => {
        pendingRef.current = false;
      });
  }, [createOrchestrator, orchestratorReady]);

  return {
    ready: state.ready || orchestratorReady,
    initializing: state.initializing || pendingRef.current,
    error: state.error,
    start,
  };
}
