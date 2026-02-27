import { useEffect, useRef, useCallback } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";
import { useEditorStore } from "../store/useEditorStore";
import { buildGraphSpec } from "../utils/buildGraphSpec";

const MOTIONGRAPH_CONTROLLER_ID = "motiongraph-editor";
const DEBOUNCE_MS = 50;

/**
 * Bridges the visual editor to the orchestrator.
 *
 * Watches the editor store for node/edge changes, converts the editor
 * state into an orchestrator GraphSpec, and registers it as a graph.
 * Must be called inside a component that is a child of both
 * `OrchestratorProvider` and `VizijRuntimeProvider`.
 *
 * @param resyncSignal - An optional value whose reference identity change
 *   triggers a re-sync.  Pass `controllers` from `useVizijRuntime()` so the
 *   driver re-registers its graph after the runtime clears all controllers.
 */
export function useMotionGraphDriver(
  namespace: string,
  resyncSignal?: unknown,
): void {
  const { ready, registerGraph, removeGraph } = useOrchestrator();

  const registeredIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncGraph = useCallback(() => {
    if (!ready) return;

    const { nodes, edges } = useEditorStore.getState();
    const built = buildGraphSpec(nodes, edges, namespace);

    // Remove previous graph if registered.
    if (registeredIdRef.current !== null) {
      try {
        removeGraph(registeredIdRef.current);
      } catch (err) {
        console.warn("[motiongraph] Failed to remove previous graph:", err);
      }
      registeredIdRef.current = null;
    }

    // Only register when there are connected outputs.
    if (!built.hasConnectedOutputs) return;

    try {
      const id = registerGraph({
        id: MOTIONGRAPH_CONTROLLER_ID,
        spec: built.spec,
        subs: {
          inputs: built.inputPaths,
          outputs: [], // empty = publish all writes
        },
      });

      registeredIdRef.current = id;
      console.log(
        `[motiongraph] Registered graph "${id}" — ` +
          `${built.spec.nodes.length} nodes, ` +
          `${built.spec.edges.length} edges, ` +
          `${built.outputPaths.length} outputs`,
      );
    } catch (err) {
      console.error("[motiongraph] Failed to register graph:", err);
      registeredIdRef.current = null;
    }
  }, [ready, namespace, registerGraph, removeGraph]);

  // Subscribe to editor store changes and debounce graph syncs.
  useEffect(() => {
    if (!ready) return;

    // Initial sync once the orchestrator is ready.
    syncGraph();

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      // Only react to structural changes (nodes or edges).
      if (state.nodes === prevState.nodes && state.edges === prevState.edges) {
        return;
      }

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        syncGraph();
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [ready, syncGraph, resyncSignal]);

  // Clean up graph on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      if (registeredIdRef.current !== null) {
        try {
          removeGraph(registeredIdRef.current);
          console.log("[motiongraph] Cleaned up graph on unmount");
        } catch {
          // Orchestrator may already be torn down.
        }
        registeredIdRef.current = null;
      }
    };
  }, [removeGraph]);
}
