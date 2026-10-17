import { useCallback, useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  behaviorValue,
  runEdits,
  type Runtime,
  type ValueInput,
} from "@vizij/runtime";
import {
  useEditorStore,
  type EditorEdge,
  type EditorNode,
} from "../store/useEditorStore";
import { buildGraphSpec } from "../utils/buildGraphSpec";

const DEBOUNCE_MS = 50;

/** The editor's run on one device: the run, the graph it runs. */
interface EditorRun {
  runtime: Runtime;
  controllerId: string;
  run: string;
  spec: object;
  signature: string;
}

/**
 * Runs the motion-graph editor's graph on the face, as a program: a
 * `run_behavior` run named after `controllerId`, beside the face's own graph.
 *
 * The first sync starts the run; each later change to the editor's graph is
 * applied to the running run in place (`runEdits` + `applyGraphEdits`), so
 * the nodes the edit keeps keep their state — springs, smoothing. A graph
 * with no connected output runs nothing. Unmounting halts the run, and its
 * outputs keep their last values: returning them to rest is the caller's
 * explicit `reset_keys`. A new `Runtime` (the face reloaded) gets a new run.
 *
 * Must be called inside `VizijRuntimeProvider`.
 */
export function useMotionGraphDriver(
  controllerId = "motiongraph-editor",
  nodesOverride?: EditorNode[],
  edgesOverride?: EditorEdge[],
): void {
  const { runtime } = useVizijRuntime();
  const runRef = useRef<EditorRun | null>(null);
  /** The device calls, one at a time and in order. */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueue = useCallback((work: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(work).catch((error) => {
      console.error("[motiongraph] the editor's run", error);
    });
  }, []);

  const syncGraph = useCallback(() => {
    if (!runtime) return;
    const { nodes, edges } =
      nodesOverride && edgesOverride
        ? { nodes: nodesOverride, edges: edgesOverride }
        : useEditorStore.getState();
    const built = buildGraphSpec(nodes, edges);
    const spec = built.spec as unknown as object;
    const signature = JSON.stringify(spec);

    enqueue(async () => {
      const current = runRef.current;
      const sameRun =
        current !== null &&
        current.runtime === runtime &&
        current.controllerId === controllerId;
      if (current && !sameRun && current.runtime === runtime) {
        runRef.current = null;
        await runtime.halt(current.run);
      }
      if (!built.hasConnectedOutputs) {
        if (sameRun && current) {
          runRef.current = null;
          await runtime.halt(current.run);
        }
        return;
      }
      if (sameRun && current) {
        if (current.signature === signature) return;
        await runtime.applyGraphEdits(
          await runEdits(current.run, current.spec, spec),
        );
        runRef.current = { ...current, spec, signature };
        return;
      }
      const handle = (await runtime.invoke("run_behavior", {
        name: controllerId,
        // `behaviorValue` returns the Arora value `run_behavior` takes, typed
        // `object`; `ValueInput` admits it.
        behavior: (await behaviorValue(spec)) as ValueInput,
      })) as { run: string };
      runRef.current = {
        runtime,
        controllerId,
        run: handle.run,
        spec,
        signature,
      };
    });
  }, [controllerId, edgesOverride, enqueue, nodesOverride, runtime]);

  // Sync now, then on every structural change of the editor's graph.
  useEffect(() => {
    if (!runtime) return;
    syncGraph();
    if (nodesOverride && edgesOverride) {
      return undefined;
    }
    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
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
  }, [edgesOverride, nodesOverride, runtime, syncGraph]);

  // Unmounting halts the run.
  useEffect(
    () => () => {
      enqueue(async () => {
        const current = runRef.current;
        runRef.current = null;
        if (current) {
          await current.runtime.halt(current.run);
        }
      });
    },
    [enqueue],
  );
}
