import { useCallback, useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  useEditorStore,
  type EditorEdge,
  type EditorNode,
} from "../store/useEditorStore";
import { buildGraphSpec } from "../utils/buildGraphSpec";

const DEBOUNCE_MS = 50;

/**
 * Bridges the visual editor to the runtime's arora device.
 *
 * Watches the editor store for node/edge changes, converts the editor state
 * into a graph spec, and publishes it as a runtime program. Playing the
 * program composes the graph into the device behavior, so evaluation and
 * value feedback go through the arora step like every other graph source.
 * Must be called inside `VizijRuntimeProvider`.
 *
 * Output resets on stop stay with the caller (`resetOutputs: false`): the
 * Viewer owns the reset values and writes them through the runtime itself.
 *
 * @param resyncSignal - An optional value whose reference identity change
 *   triggers a re-sync.  Pass `controllers` from `useVizijRuntime()` so the
 *   driver re-publishes its graph after the runtime clears all controllers.
 */
export function useMotionGraphDriver(
  namespace: string,
  controllerId = "motiongraph-editor",
  resyncSignal?: unknown,
  nodesOverride?: EditorNode[],
  edgesOverride?: EditorEdge[],
): void {
  const {
    ready,
    assetBundle,
    setGraphBundle,
    playProgram,
    stopProgram,
    getProgramState,
  } = useVizijRuntime();

  const publishedIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncGraph = useCallback(() => {
    if (!ready) return;

    const { nodes, edges } =
      nodesOverride && edgesOverride
        ? { nodes: nodesOverride, edges: edgesOverride }
        : useEditorStore.getState();
    const built = buildGraphSpec(nodes, edges, namespace);

    // Stop the previous program when the target changes.
    if (
      publishedIdRef.current !== null &&
      publishedIdRef.current !== controllerId
    ) {
      try {
        stopProgram(publishedIdRef.current, { resetOutputs: false });
      } catch (err) {
        console.warn("[motiongraph] Failed to stop previous program:", err);
      }
      publishedIdRef.current = null;
    }

    // Only publish when there are connected outputs.
    if (!built.hasConnectedOutputs) {
      if (publishedIdRef.current !== null) {
        try {
          stopProgram(publishedIdRef.current, { resetOutputs: false });
        } catch (err) {
          console.warn("[motiongraph] Failed to stop program:", err);
        }
        publishedIdRef.current = null;
      }
      setGraphBundle({ programs: [] }, { tier: "graphs" });
      return;
    }

    setGraphBundle(
      {
        programs: [
          {
            id: controllerId,
            label: "Motion graph editor",
            graph: { id: controllerId, spec: built.spec },
          },
        ],
      },
      { tier: "graphs" },
    );
    publishedIdRef.current = controllerId;
    console.log(
      `[motiongraph] Published program "${controllerId}" — ` +
        `${built.spec.nodes.length} nodes, ` +
        `${built.spec.edges.length} edges, ` +
        `${built.outputPaths.length} outputs`,
    );
  }, [
    controllerId,
    edgesOverride,
    namespace,
    nodesOverride,
    ready,
    setGraphBundle,
    stopProgram,
  ]);

  // Play the published program once the runtime bundle carries it. Runs on
  // every bundle change so the program resumes playing after the runtime
  // re-registers its controllers.
  useEffect(() => {
    const id = publishedIdRef.current;
    if (!ready || id === null) return;
    const available = assetBundle.programs?.some(
      (program) => program.id === id,
    );
    if (!available) return;
    if (getProgramState(id)?.state === "playing") return;
    try {
      playProgram(id);
    } catch (err) {
      console.error("[motiongraph] Failed to play program:", err);
    }
  }, [assetBundle, getProgramState, playProgram, ready, resyncSignal]);

  // Subscribe to editor store changes and debounce graph syncs.
  useEffect(() => {
    if (!ready) return;

    // Initial sync once the runtime is ready.
    syncGraph();

    if (nodesOverride && edgesOverride) {
      return () => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    }

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
  }, [edgesOverride, nodesOverride, ready, syncGraph, resyncSignal]);

  // Clean up the program on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      if (publishedIdRef.current !== null) {
        try {
          stopProgram(publishedIdRef.current, { resetOutputs: false });
          setGraphBundle({ programs: [] }, { tier: "graphs" });
          console.log("[motiongraph] Cleaned up program on unmount");
        } catch {
          // Runtime may already be torn down.
        }
        publishedIdRef.current = null;
      }
    };
  }, [setGraphBundle, stopProgram]);
}
