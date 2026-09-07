import { useCallback, useEffect, useMemo, useRef } from "react";
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
 * @param resyncSignal - An optional value whose *contents* changing triggers a
 *   re-sync. Pass `controllers` from `useVizijRuntime()` so the driver
 *   re-publishes its graph after the runtime clears all controllers. Compared
 *   by content rather than by identity: the runtime rebuilds that object every
 *   time it refreshes its status, which a publish itself causes.
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

  /**
   * The runtime's mutating methods, held by reference.
   *
   * `stopProgram` is a `useCallback` over `resolveProgramById`, which is
   * memoized on `assetBundle.programs` — and `setGraphBundle` replaces that
   * array with a new one on every publish. So publishing gave `stopProgram` a
   * new identity, which re-ran every effect below that listed it, which
   * published again: an unbreakable cycle. Measured while a program played,
   * "Published program" and "Cleaned up program on unmount" each logged 561
   * times in a few seconds, the provider re-registered its graphs 579 times,
   * and React ended it with "Maximum update depth exceeded" and an unmounted
   * tree — the app went blank.
   *
   * The methods are only ever called, never compared, so a ref is all they
   * need; what the effects react to is the editor state and the resync signal.
   */
  const setGraphBundleRef = useRef(setGraphBundle);
  setGraphBundleRef.current = setGraphBundle;
  const stopProgramRef = useRef(stopProgram);
  stopProgramRef.current = stopProgram;

  /**
   * The resync signal by content, not by identity.
   *
   * The caller passes `controllers` from the runtime so the driver
   * re-publishes after the runtime clears and re-registers its graphs. But
   * `listControllers()` builds a fresh object every time the provider
   * refreshes its status — which a publish itself causes — so depending on its
   * identity meant "the runtime re-registered" and "I just published" were
   * indistinguishable, and the second fed the first. Comparing the contents
   * keeps the intent and drops the feedback.
   */
  const resyncKey = useMemo(() => {
    if (resyncSignal === undefined || resyncSignal === null) {
      return String(resyncSignal);
    }
    try {
      return JSON.stringify(resyncSignal);
    } catch {
      return String(resyncSignal);
    }
  }, [resyncSignal]);

  /**
   * What was last handed to the runtime: the program id, the spec, and the
   * resync signal it was published under.
   *
   * The driver is called with the editor's node and edge arrays, and those get
   * new identities for reasons the runtime does not care about — React Flow
   * reports measured node dimensions through `onNodesChange`, so a re-render
   * of the canvas rewrites the array. Measured while a program played, that
   * closed a cycle: new node identities re-ran the sync effect, the publish
   * changed the runtime bundle, the bundle change re-rendered the canvas,
   * React Flow measured again. Publishing only when the spec actually differs
   * breaks it at the point where "the editor changed" becomes "the runtime
   * must change", and leaves a genuine resync (the runtime cleared its
   * controllers) still able to force one.
   */
  const lastPublishedRef = useRef<{
    controllerId: string;
    spec: string;
    resyncKey: string;
  } | null>(null);

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
        stopProgramRef.current(publishedIdRef.current, {
          resetOutputs: false,
        });
      } catch (err) {
        console.warn("[motiongraph] Failed to stop previous program:", err);
      }
      publishedIdRef.current = null;
    }

    // Only publish when there are connected outputs.
    if (!built.hasConnectedOutputs) {
      if (publishedIdRef.current !== null) {
        try {
          stopProgramRef.current(publishedIdRef.current, {
            resetOutputs: false,
          });
        } catch (err) {
          console.warn("[motiongraph] Failed to stop program:", err);
        }
        publishedIdRef.current = null;
      }
      if (
        lastPublishedRef.current?.spec === "" &&
        lastPublishedRef.current.resyncKey === resyncKey
      ) {
        return;
      }
      lastPublishedRef.current = { controllerId, spec: "", resyncKey };
      setGraphBundleRef.current({ programs: [] }, { tier: "graphs" });
      return;
    }

    const specSignature = JSON.stringify(built.spec);
    if (
      publishedIdRef.current === controllerId &&
      lastPublishedRef.current?.controllerId === controllerId &&
      lastPublishedRef.current.spec === specSignature &&
      lastPublishedRef.current.resyncKey === resyncKey
    ) {
      return;
    }
    lastPublishedRef.current = {
      controllerId,
      spec: specSignature,
      resyncKey,
    };

    setGraphBundleRef.current(
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
  }, [controllerId, edgesOverride, namespace, nodesOverride, ready, resyncKey]);

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
  }, [assetBundle, getProgramState, playProgram, ready, resyncKey]);

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
  }, [edgesOverride, nodesOverride, ready, syncGraph, resyncKey]);

  // Clean up the program on unmount — on unmount only. With `setGraphBundle`
  // and `stopProgram` as dependencies this ran its cleanup whenever one of
  // them changed identity, which a publish itself caused: it stopped the
  // program it had just published and cleared the bundle, the sync effect
  // published it again, and the two ran until React gave up.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      if (publishedIdRef.current !== null) {
        try {
          stopProgramRef.current(publishedIdRef.current, {
            resetOutputs: false,
          });
          setGraphBundleRef.current({ programs: [] }, { tier: "graphs" });
          console.log("[motiongraph] Cleaned up program on unmount");
        } catch {
          // Runtime may already be torn down.
        }
        publishedIdRef.current = null;
      }
    };
  }, []);
}
