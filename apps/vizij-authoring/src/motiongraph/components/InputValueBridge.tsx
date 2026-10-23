import { useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useEditorStore, type EditorNode } from "../store/useEditorStore";
import { INPUT_SOURCE_TYPE, type InputSourceNodeData } from "./InputSourceNode";

/**
 * Headless component that writes the editor's input source values to the
 * face's store (`runtime.setValue`), under the paths the nodes name — the
 * face's own keys. Must be rendered inside VizijRuntimeProvider.
 *
 * The inspector sets `appliedValue` according to the control mode:
 *  - Instant: `appliedValue` is set on every slider change
 *  - Trigger: `appliedValue` is set only when the Trigger button is clicked
 */
export function InputValueBridge({
  active,
  nodes,
}: {
  active: boolean;
  nodes?: EditorNode[];
}) {
  if (!active) {
    return null;
  }
  return <InputValueBridgeInner nodes={nodes} />;
}

function InputValueBridgeInner({ nodes }: { nodes?: EditorNode[] }) {
  const { runtime } = useVizijRuntime();
  // Track last pushed values to avoid redundant setInput calls.
  const pushedRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!runtime) return;

    const syncNodes = nodes ?? useEditorStore.getState().nodes;

    // Push current values immediately.
    syncAll(syncNodes);

    if (nodes) {
      return () => {
        pushedRef.current.clear();
      };
    }

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
  }, [nodes, runtime]);

  function syncAll(nodes: EditorNode[]) {
    for (const node of nodes) {
      if (node.type !== INPUT_SOURCE_TYPE) continue;
      const d = node.data as InputSourceNodeData;
      if (!d.inputPath) continue;

      const value = d.appliedValue ?? d.defaultValue ?? 0;
      const valueType = d.valueType ?? "f32";

      // Skip if we already pushed this exact value for this path.
      if (pushedRef.current.get(d.inputPath) === value) continue;

      try {
        if (valueType === "bool") {
          runtime!.setValue(d.inputPath, { bool: value !== 0 });
        } else {
          runtime!.setValue(
            d.inputPath,
            valueType === "i32" ? Math.round(value) : value,
          );
        }
        pushedRef.current.set(d.inputPath, value);
      } catch (err) {
        console.warn(
          "[motiongraph] InputValueBridge failed:",
          d.inputPath,
          err,
        );
      }
    }
  }

  return null;
}
