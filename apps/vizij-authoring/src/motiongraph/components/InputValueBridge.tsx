import { useEffect, useRef } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useEditorStore, type EditorNode } from "../store/useEditorStore";
import { INPUT_SOURCE_TYPE, type InputSourceNodeData } from "./InputSourceNode";

/**
 * Headless component that bridges input source node values from the editor
 * store to the orchestrator.  Must be rendered inside VizijRuntimeProvider.
 *
 * It watches the editor store for input source nodes and pushes their
 * `appliedValue` to the orchestrator blackboard via `setInput()`.
 *
 * The inspector sets `appliedValue` according to the control mode:
 *  - Instant: `appliedValue` is set on every slider change
 *  - Trigger: `appliedValue` is set only when the Trigger button is clicked
 */
export function InputValueBridge({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }
  return <InputValueBridgeInner />;
}

function InputValueBridgeInner() {
  const { setInput, ready: orchestratorReady } = useOrchestrator();
  const { namespace } = useVizijRuntime();
  // Track last pushed values to avoid redundant setInput calls.
  const pushedRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!orchestratorReady) return;

    // Push current values immediately.
    syncAll(useEditorStore.getState().nodes);

    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      if (state.nodes === prevState.nodes) return;
      syncAll(state.nodes);
    });

    return () => {
      unsubscribe();
      // Clear tracked values on deactivation so we re-push on reactivation.
      pushedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchestratorReady, namespace, setInput]);

  function syncAll(nodes: EditorNode[]) {
    for (const node of nodes) {
      if (node.type !== INPUT_SOURCE_TYPE) continue;
      const d = node.data as InputSourceNodeData;
      if (!d.inputPath) continue;

      const namespacedPath = namespace
        ? `${namespace}/${d.inputPath}`
        : d.inputPath;
      const value = d.appliedValue ?? d.defaultValue ?? 0;
      const valueType = d.valueType ?? "f32";

      // Skip if we already pushed this exact value for this path.
      if (pushedRef.current.get(d.inputPath) === value) continue;

      try {
        if (valueType === "bool") {
          setInput(namespacedPath, { bool: value !== 0 });
        } else {
          setInput(namespacedPath, {
            float: valueType === "i32" ? Math.round(value) : value,
          });
        }
        pushedRef.current.set(d.inputPath, value);
      } catch (err) {
        console.warn(
          "[motiongraph] InputValueBridge failed:",
          namespacedPath,
          err,
        );
      }
    }
  }

  return null;
}
